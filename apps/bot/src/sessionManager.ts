import { logger as defaultLogger } from '@cs/core';
import type { BotRuntimeSessionRecord, CompanyRuntimeProfile } from '@cs/shared';
import { createBotRuntimeConfig, type BotRuntimeConfig } from './runtimeConfig';
import {
  startBot as defaultStartBot,
  type BotLogger,
  type BotProcess,
  type BotRuntimeHandle,
  type BotSessionStatus,
  type StartBotOptions,
} from './runtime';
import {
  createConvexCompanyRuntimeStore,
  type CompanyRuntimeStore,
} from './companyRuntimeStore';

const HEARTBEAT_INTERVAL_MS = 20_000;
const SESSION_LEASE_MS = 60_000;

export interface ManagedTenantSession {
  profile: CompanyRuntimeProfile;
  status: BotSessionStatus;
}

interface ManagedTenantSessionInternal extends ManagedTenantSession {
  handle?: BotRuntimeHandle;
}

export interface SessionManagerStore extends CompanyRuntimeStore {}

export interface SessionManagerTimer {
  setInterval(handler: () => void | Promise<void>, delayMs: number): unknown;
  clearInterval(intervalId: unknown): void;
}

export interface TenantSessionManagerHandle {
  getRuntimeOwnerId(): string;
  getSession(companyId: string): ManagedTenantSession | undefined;
  listSessions(): ManagedTenantSession[];
  stop(): Promise<void>;
}

export interface StartTenantSessionManagerOptions {
  botProcess?: BotProcess;
  logger?: BotLogger;
  now?: () => number;
  runtimeOwnerId?: string;
  registerProcessHandlers?: boolean;
  startBot?: (options: StartBotOptions) => Promise<BotRuntimeHandle>;
  store?: SessionManagerStore;
  timer?: SessionManagerTimer;
  createRuntimeConfig?: (overrides?: Parameters<typeof createBotRuntimeConfig>[0]) => BotRuntimeConfig;
}

const defaultTimer: SessionManagerTimer = {
  setInterval: (handler, delayMs) => globalThis.setInterval(handler, delayMs),
  clearInterval: (intervalId) => globalThis.clearInterval(intervalId as ReturnType<typeof setInterval>),
};

const cloneStatus = (status: BotSessionStatus): BotSessionStatus => ({
  sessionKey: status.sessionKey,
  state: status.state,
  attempt: status.attempt,
  hasQr: status.hasQr,
  ...(status.disconnectCode !== undefined ? { disconnectCode: status.disconnectCode } : {}),
  ...(status.isNewLogin !== undefined ? { isNewLogin: status.isNewLogin } : {}),
});

const toSessionRecord = (
  runtimeOwnerId: string,
  companyId: string,
  now: number,
  status: BotSessionStatus,
): BotRuntimeSessionRecord => ({
  companyId,
  runtimeOwnerId,
  sessionKey: status.sessionKey,
  state: status.state,
  attempt: status.attempt,
  hasQr: status.hasQr,
  ...(status.disconnectCode !== undefined ? { disconnectCode: status.disconnectCode } : {}),
  ...(status.isNewLogin !== undefined ? { isNewLogin: status.isNewLogin } : {}),
  updatedAt: now,
  leaseExpiresAt: now + SESSION_LEASE_MS,
});

export const startTenantSessionManager = async (
  options: StartTenantSessionManagerOptions = {},
): Promise<TenantSessionManagerHandle> => {
  const botLogger = options.logger ?? defaultLogger;
  const botProcess = options.botProcess ?? process;
  const now = options.now ?? Date.now;
  const registerProcessHandlers = options.registerProcessHandlers ?? true;
  const runtimeOwnerId = options.runtimeOwnerId ?? crypto.randomUUID();
  const startBot = options.startBot ?? defaultStartBot;
  const store = options.store ?? createConvexCompanyRuntimeStore();
  const timer = options.timer ?? defaultTimer;
  const createRuntimeConfig = options.createRuntimeConfig ?? createBotRuntimeConfig;
  const sessions = new Map<string, ManagedTenantSessionInternal>();
  let heartbeatId: unknown;
  let stopping = false;

  const upsertStatus = async (companyId: string, status: BotSessionStatus): Promise<void> => {
    await store.upsertSession(toSessionRecord(runtimeOwnerId, companyId, now(), status));
  };

  const handleStatusChange = async (
    profile: CompanyRuntimeProfile,
    status: BotSessionStatus,
  ): Promise<void> => {
    const nextStatus = cloneStatus(status);
    const existing = sessions.get(profile.companyId);
    sessions.set(profile.companyId, {
      profile,
      status: nextStatus,
      ...(existing?.handle ? { handle: existing.handle } : {}),
    });

    try {
      await upsertStatus(profile.companyId, nextStatus);
    } catch (error) {
      botLogger.error(
        {
          companyId: profile.companyId,
          error,
          sessionKey: nextStatus.sessionKey,
        },
        "tenant session status persistence failed",
      );
    }
  };

  const renewHeartbeat = async (): Promise<void> => {
    const updates = Array.from(sessions.values()).map(async (session) => {
      try {
        await upsertStatus(session.profile.companyId, session.status);
      } catch (error) {
        botLogger.error(
          {
            companyId: session.profile.companyId,
            error,
            sessionKey: session.status.sessionKey,
          },
          "tenant session heartbeat persistence failed",
        );
      }
    });

    await Promise.all(updates);
  };

  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;

    if (heartbeatId !== undefined) {
      timer.clearInterval(heartbeatId);
      heartbeatId = undefined;
    }

    await Promise.allSettled(
      Array.from(sessions.values()).map(async (session) => session.handle?.stop()),
    );

    await store.releaseSessionsByOwner(runtimeOwnerId);
  };

  const profiles = await store.listEnabledCompanies();

  await Promise.allSettled(
    profiles.map(async (profile) => {
      const initialStatus: BotSessionStatus = {
        sessionKey: profile.sessionKey,
        state: "initializing",
        attempt: 0,
        hasQr: false,
      };
      await handleStatusChange(profile, initialStatus);

      try {
        const handle = await startBot({
          logger: typeof botLogger.child === "function"
            ? botLogger.child({
              companyId: profile.companyId,
              sessionKey: profile.sessionKey,
            })
            : botLogger,
          onStatusChange: (status) => handleStatusChange(profile, status),
          registerProcessHandlers: false,
          runtimeConfig: createRuntimeConfig({
            sessionKey: profile.sessionKey,
          }),
        });

        const currentStatus = cloneStatus(handle.getStatus());
        sessions.set(profile.companyId, {
          profile,
          status: currentStatus,
          handle,
        });
        await upsertStatus(profile.companyId, currentStatus);
      } catch (error) {
        const failedStatus: BotSessionStatus = {
          sessionKey: profile.sessionKey,
          state: "failed",
          attempt: 0,
          hasQr: false,
        };
        sessions.set(profile.companyId, {
          profile,
          status: failedStatus,
        });
        await upsertStatus(profile.companyId, failedStatus).catch((persistError) => {
          botLogger.error(
            {
              companyId: profile.companyId,
              error: persistError,
              sessionKey: profile.sessionKey,
            },
            "tenant session status persistence failed",
          );
        });
        botLogger.error(
          {
            companyId: profile.companyId,
            error,
            sessionKey: profile.sessionKey,
          },
          "tenant session startup failed",
        );
      }
    }),
  );

  heartbeatId = timer.setInterval(() => renewHeartbeat(), HEARTBEAT_INTERVAL_MS);

  if (registerProcessHandlers) {
    for (const signal of ["SIGINT", "SIGTERM", "beforeExit"] as const) {
      botProcess.once(signal, () => stop());
    }
  }

  return {
    getRuntimeOwnerId: () => runtimeOwnerId,
    getSession: (companyId) => {
      const session = sessions.get(companyId);
      if (!session) {
        return undefined;
      }

      return {
        profile: session.profile,
        status: cloneStatus(session.status),
      };
    },
    listSessions: () =>
      Array.from(sessions.values()).map((session) => ({
        profile: session.profile,
        status: cloneStatus(session.status),
      })),
    stop,
  };
};
