import { env } from '@cs/config';
import { logger as defaultLogger } from '@cs/core';
import {
  type IgnoredInboundEvent,
  type IgnoredInboundEventReason,
  getBotRuntimeReconnectDelayMs,
  getBotRuntimeNextActionHint,
  getBotRuntimeOperatorState,
  getBotRuntimeOperatorSummary,
  type NormalizedInboundMessage,
  type BotRuntimeOperatorSnapshot,
  type BotRuntimePairingArtifact,
  type BotRuntimeSessionRecord,
  type CompanyRuntimeProfile,
} from '@cs/shared';
import { normalizeInboundMessages } from './inbound';
import {
  createOutboundMessenger as defaultCreateOutboundMessenger,
  type CreateOutboundMessengerOptions,
  type OutboundMessenger,
} from './outbound';
import { createBotRuntimeConfig, type BotRuntimeConfig } from './runtimeConfig';
import {
  type BotPairingStatus,
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

interface ManagedTenantSessionInternal {
  outbound?: OutboundMessenger;
  profile: CompanyRuntimeProfile;
  status: BotSessionStatus;
  pairing: BotPairingStatus | null;
  runtimeConfig: BotRuntimeConfig;
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
  getOutbound(companyId: string): OutboundMessenger | undefined;
  listSessions(): ManagedTenantSession[];
  stop(): Promise<void>;
}

export interface StartTenantSessionManagerOptions {
  botProcess?: BotProcess;
  inboundRouter?: InboundMessageRouter;
  logger?: BotLogger;
  now?: () => number;
  runtimeOwnerId?: string;
  registerProcessHandlers?: boolean;
  startBot?: (options: StartBotOptions) => Promise<BotRuntimeHandle>;
  store?: SessionManagerStore;
  timer?: SessionManagerTimer;
  createRuntimeConfig?: (overrides?: Parameters<typeof createBotRuntimeConfig>[0]) => BotRuntimeConfig;
  createOutboundMessenger?: (options: CreateOutboundMessengerOptions) => OutboundMessenger;
}

export interface InboundMessageRouter {
  handleOwnerCommand(message: NormalizedInboundMessage): Promise<void>;
  handleCustomerConversation(message: NormalizedInboundMessage): Promise<void>;
  handleIgnored(event: IgnoredInboundEvent): Promise<void> | void;
}

const defaultTimer: SessionManagerTimer = {
  setInterval: (handler, delayMs) => globalThis.setInterval(handler, delayMs),
  clearInterval: (intervalId) => globalThis.clearInterval(intervalId as ReturnType<typeof setInterval>),
};

const OPERATOR_SHELL_PATH = "/runtime/bot";

const defaultInboundRouter: InboundMessageRouter = {
  handleCustomerConversation: async () => undefined,
  handleIgnored: async () => undefined,
  handleOwnerCommand: async () => undefined,
};

const malformedIgnoredReasons = new Set<IgnoredInboundEventReason>([
  "missing_message_id",
  "missing_remote_jid",
  "missing_sender_phone",
  "missing_timestamp",
  "unsupported_message_type",
  "empty_payload",
]);

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

const clonePairing = (pairing: BotPairingStatus): BotPairingStatus => ({
  sessionKey: pairing.sessionKey,
  state: pairing.state,
  updatedAt: pairing.updatedAt,
  ...(pairing.expiresAt !== undefined ? { expiresAt: pairing.expiresAt } : {}),
  ...(pairing.qrText !== undefined ? { qrText: pairing.qrText } : {}),
});

const getOperatorShellUrl = (companyId: string): string => {
  return `http://127.0.0.1:${env.API_PORT}${OPERATOR_SHELL_PATH}?companyId=${encodeURIComponent(companyId)}`;
};

const toOperatorSnapshot = (
  runtimeOwnerId: string,
  now: number,
  session: ManagedTenantSessionInternal,
): BotRuntimeOperatorSnapshot => ({
  ...session.profile,
  session: toSessionRecord(runtimeOwnerId, session.profile.companyId, now, session.status),
  pairing: session.pairing && session.pairing.state !== "none"
    ? {
      updatedAt: session.pairing.updatedAt,
      expiresAt: session.pairing.expiresAt!,
      ...(session.pairing.qrText !== undefined ? { qrText: session.pairing.qrText } : {}),
    }
    : null,
});

const toOperatorLogPayload = (
  snapshot: BotRuntimeOperatorSnapshot,
  now: number,
  nextRetryAt?: number,
) => ({
  companyId: snapshot.companyId,
  companyName: snapshot.name,
  sessionKey: snapshot.session?.sessionKey ?? snapshot.sessionKey,
  state: snapshot.session?.state ?? "closed",
  attempt: snapshot.session?.attempt ?? 0,
  ...(snapshot.session?.disconnectCode !== undefined ? { disconnectCode: snapshot.session.disconnectCode } : {}),
  pairingState: snapshot.pairing ? (snapshot.pairing.expiresAt > now ? "ready" : "expired") : "none",
  ...(snapshot.pairing ? { expiresAt: snapshot.pairing.expiresAt } : {}),
  ...(nextRetryAt !== undefined ? { nextRetryAt } : {}),
  operatorState: getBotRuntimeOperatorState(snapshot, now),
  summary: getBotRuntimeOperatorSummary(snapshot, now).text,
  ...(getBotRuntimeNextActionHint(snapshot, now) !== undefined
    ? { nextActionHint: getBotRuntimeNextActionHint(snapshot, now) }
    : {}),
});

const toPairingArtifact = (
  runtimeOwnerId: string,
  companyId: string,
  pairing: BotPairingStatus,
): BotRuntimePairingArtifact => {
  if (
    (pairing.state !== "ready" && pairing.state !== "expired") ||
    pairing.qrText === undefined ||
    pairing.expiresAt === undefined
  ) {
    throw new Error("Expected a pairing status with QR data");
  }

  return {
    companyId,
    runtimeOwnerId,
    sessionKey: pairing.sessionKey,
    qrText: pairing.qrText,
    updatedAt: pairing.updatedAt,
    expiresAt: pairing.expiresAt,
  };
};

export const startTenantSessionManager = async (
  options: StartTenantSessionManagerOptions = {},
): Promise<TenantSessionManagerHandle> => {
  const botLogger = options.logger ?? defaultLogger;
  const botProcess = options.botProcess ?? process;
  const now = options.now ?? Date.now;
  const registerProcessHandlers = options.registerProcessHandlers ?? true;
  const runtimeOwnerId = options.runtimeOwnerId ?? crypto.randomUUID();
  const inboundRouter = options.inboundRouter ?? defaultInboundRouter;
  const startBot = options.startBot ?? defaultStartBot;
  const store = options.store ?? createConvexCompanyRuntimeStore();
  const timer = options.timer ?? defaultTimer;
  const createRuntimeConfig = options.createRuntimeConfig ?? createBotRuntimeConfig;
  const createOutboundMessenger = options.createOutboundMessenger ?? defaultCreateOutboundMessenger;
  const sessions = new Map<string, ManagedTenantSessionInternal>();
  let heartbeatId: unknown;
  let stopping = false;

  const upsertStatus = async (companyId: string, status: BotSessionStatus): Promise<void> => {
    await store.upsertSession(toSessionRecord(runtimeOwnerId, companyId, now(), status));
  };

  const clearPairingArtifact = async (profile: CompanyRuntimeProfile): Promise<void> => {
    try {
      await store.clearPairingArtifact(profile.companyId);
    } catch (error) {
      botLogger.error(
        {
          companyId: profile.companyId,
          error,
          sessionKey: profile.sessionKey,
        },
        "tenant session pairing artifact cleanup failed",
      );
    }
  };

  const logIgnoredInboundEvent = (profile: CompanyRuntimeProfile, event: IgnoredInboundEvent): void => {
    const payload = {
      companyId: profile.companyId,
      reason: event.reason,
      sessionKey: profile.sessionKey,
      ...(event.source.rawMessageId !== undefined ? { messageId: event.source.rawMessageId } : {}),
    };

    if (malformedIgnoredReasons.has(event.reason)) {
      const warn = botLogger.warn?.bind(botLogger) ?? botLogger.info.bind(botLogger);
      warn(payload, "tenant inbound event ignored");
      return;
    }

    const debug = botLogger.debug?.bind(botLogger) ?? botLogger.info.bind(botLogger);
    debug(payload, "tenant inbound event ignored");
  };

  const routeInboundEvent = async (
    profile: CompanyRuntimeProfile,
    event: IgnoredInboundEvent | NormalizedInboundMessage,
    route?: "owner_command" | "customer_conversation",
  ): Promise<void> => {
    try {
      if (route === "owner_command") {
        await inboundRouter.handleOwnerCommand(event as NormalizedInboundMessage);
        return;
      }

      if (route === "customer_conversation") {
        await inboundRouter.handleCustomerConversation(event as NormalizedInboundMessage);
        return;
      }

      logIgnoredInboundEvent(profile, event as IgnoredInboundEvent);
      await inboundRouter.handleIgnored(event as IgnoredInboundEvent);
    } catch (error) {
      botLogger.error(
        {
          companyId: profile.companyId,
          error,
          sessionKey: profile.sessionKey,
        },
        "tenant inbound message routing failed",
      );
    }
  };

  const handleMessagesUpsert = async (
    profile: CompanyRuntimeProfile,
    event: Parameters<typeof normalizeInboundMessages>[1],
  ): Promise<void> => {
    const dispatches = normalizeInboundMessages(profile, event);

    for (const dispatch of dispatches) {
      if (dispatch.kind === "ignored") {
        await routeInboundEvent(profile, dispatch.event);
        continue;
      }

      await routeInboundEvent(profile, dispatch.message, dispatch.route);
    }
  };

  const handleStatusChange = async (
    profile: CompanyRuntimeProfile,
    status: BotSessionStatus,
  ): Promise<void> => {
    const nextStatus = cloneStatus(status);
    const existing = sessions.get(profile.companyId);
    sessions.set(profile.companyId, {
      profile,
      pairing: existing?.pairing ?? null,
      runtimeConfig: existing?.runtimeConfig ?? createRuntimeConfig({
        sessionKey: profile.sessionKey,
      }),
      status: nextStatus,
      ...(existing?.outbound ? { outbound: existing.outbound } : {}),
      ...(existing?.handle ? { handle: existing.handle } : {}),
    });

    const currentSession = sessions.get(profile.companyId);
    if (currentSession) {
      const logNow = now();
      const snapshot = toOperatorSnapshot(runtimeOwnerId, logNow, currentSession);

      if (nextStatus.state === "reconnecting") {
        const nextRetryAt = logNow + getBotRuntimeReconnectDelayMs(
          nextStatus.attempt,
          currentSession.runtimeConfig.reconnectBackoff,
        );
        botLogger.info(
          toOperatorLogPayload(snapshot, logNow, nextRetryAt),
          "bot reconnect scheduled",
        );
      }
    }

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

  const handlePairingChange = async (
    profile: CompanyRuntimeProfile,
    pairing: BotPairingStatus,
  ): Promise<void> => {
    const nextPairing = clonePairing(pairing);
    const existing = sessions.get(profile.companyId);
    if (existing) {
      sessions.set(profile.companyId, {
        ...existing,
        pairing: nextPairing,
      });
    }

    const currentSession = sessions.get(profile.companyId);
    if (currentSession) {
      const logNow = now();
      const snapshot = toOperatorSnapshot(runtimeOwnerId, logNow, currentSession);

      if (nextPairing.state === "ready") {
        botLogger.info(
          {
            ...toOperatorLogPayload(snapshot, logNow),
            operatorUrl: getOperatorShellUrl(profile.companyId),
          },
          "bot pairing available",
        );
      }

      if (nextPairing.state === "expired") {
        botLogger.info(
          toOperatorLogPayload(snapshot, logNow),
          "bot pairing expired",
        );
      }
    }

    if (nextPairing.state === "none") {
      await clearPairingArtifact(profile);
      return;
    }

    try {
      await store.upsertPairingArtifact(toPairingArtifact(runtimeOwnerId, profile.companyId, nextPairing));
    } catch (error) {
      botLogger.error(
        {
          companyId: profile.companyId,
          error,
          sessionKey: nextPairing.sessionKey,
        },
        "tenant session pairing artifact persistence failed",
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

    await Promise.allSettled([
      store.releaseSessionsByOwner(runtimeOwnerId),
      store.releasePairingArtifactsByOwner(runtimeOwnerId),
    ]);
  };

  const profiles = await store.listEnabledCompanies();

  await Promise.allSettled(
    profiles.map(async (profile) => {
      let handle: BotRuntimeHandle | undefined;
      let runtimeConfig: BotRuntimeConfig | undefined;

      try {
        await clearPairingArtifact(profile);

        const initialStatus: BotSessionStatus = {
          sessionKey: profile.sessionKey,
          state: "initializing",
          attempt: 0,
          hasQr: false,
        };
        runtimeConfig = createRuntimeConfig({
          sessionKey: profile.sessionKey,
        });
        sessions.set(profile.companyId, {
          profile,
          status: initialStatus,
          pairing: null,
          runtimeConfig,
        });
        await handleStatusChange(profile, initialStatus);

        handle = await startBot({
          logger: typeof botLogger.child === "function"
            ? botLogger.child({
              companyId: profile.companyId,
              sessionKey: profile.sessionKey,
            })
            : botLogger,
          onMessagesUpsert: (event) => handleMessagesUpsert(profile, event),
          onPairingChange: (pairing) => handlePairingChange(profile, pairing),
          onStatusChange: (status) => handleStatusChange(profile, status),
          registerProcessHandlers: false,
          runtimeConfig,
        });

        const currentStatus = cloneStatus(handle.getStatus());
        const outbound = createOutboundMessenger({
          logger: typeof botLogger.child === "function"
            ? botLogger.child({
              companyId: profile.companyId,
              sessionKey: profile.sessionKey,
              surface: "outbound",
            })
            : botLogger,
          transport: handle,
        });
        sessions.set(profile.companyId, {
          outbound,
          profile,
          status: currentStatus,
          pairing: sessions.get(profile.companyId)?.pairing ?? null,
          runtimeConfig,
          handle,
        });
        await upsertStatus(profile.companyId, currentStatus);
      } catch (error) {
        if (handle) {
          try {
            await handle.stop();
          } catch (stopError) {
            botLogger.error(
              {
                companyId: profile.companyId,
                error: stopError,
                sessionKey: profile.sessionKey,
              },
              "tenant session shutdown after startup failure failed",
            );
          }
        }

        const failedStatus: BotSessionStatus = {
          sessionKey: profile.sessionKey,
          state: "failed",
          attempt: 0,
          hasQr: false,
        };
        let fallbackConfig = runtimeConfig;
        if (!fallbackConfig) {
          try {
            fallbackConfig = createRuntimeConfig({ sessionKey: profile.sessionKey });
          } catch {
            fallbackConfig = createBotRuntimeConfig({ sessionKey: profile.sessionKey });
          }
        }

        sessions.set(profile.companyId, {
          profile,
          status: failedStatus,
          pairing: sessions.get(profile.companyId)?.pairing ?? null,
          runtimeConfig: fallbackConfig,
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
    getOutbound: (companyId) => sessions.get(companyId)?.outbound,
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
