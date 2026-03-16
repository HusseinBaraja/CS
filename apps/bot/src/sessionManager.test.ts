import { describe, expect, test } from 'bun:test';
import type {
  BotRuntimeSessionRecord,
  CompanyRuntimeProfile,
} from '@cs/shared';
import type { BotRuntimeHandle, BotSessionStatus, StartBotOptions } from './runtime';
import { startTenantSessionManager, type SessionManagerStore } from './sessionManager';

const createProfile = (
  companyId: string,
  overrides: Partial<CompanyRuntimeProfile> = {},
): CompanyRuntimeProfile => ({
  companyId,
  name: `Tenant ${companyId}`,
  ownerPhone: `966500000${companyId.slice(-1)}`,
  timezone: "UTC",
  sessionKey: `company-${companyId}`,
  ...overrides,
});

const createLoggerStub = () => {
  const infoCalls: Array<{ payload: unknown; message: string }> = [];
  const errorCalls: Array<{ payload: unknown; message: string }> = [];

  return {
    logger: {
      info: (payload: unknown, message: string) => {
        infoCalls.push({ payload, message });
      },
      error: (payload: unknown, message: string) => {
        errorCalls.push({ payload, message });
      },
      child: () => ({
        info: (payload: unknown, message: string) => {
          infoCalls.push({ payload, message });
        },
        error: (payload: unknown, message: string) => {
          errorCalls.push({ payload, message });
        },
      }),
    },
    errorCalls,
    infoCalls,
  };
};

const createIntervalTimerStub = () => {
  const intervals: Array<{
    callback: () => void | Promise<void>;
    delayMs: number;
    id: number;
    cleared: boolean;
  }> = [];
  let nextId = 1;

  return {
    timer: {
      setInterval: (callback: () => void | Promise<void>, delayMs: number) => {
        const interval = {
          callback,
          delayMs,
          id: nextId,
          cleared: false,
        };
        nextId += 1;
        intervals.push(interval);
        return interval.id;
      },
      clearInterval: (intervalId: unknown) => {
        const interval = intervals.find((entry) => entry.id === intervalId);
        if (interval) {
          interval.cleared = true;
        }
      },
    },
    intervals,
  };
};

const createStoreStub = (
  companies: CompanyRuntimeProfile[],
): SessionManagerStore & {
  upsertCalls: BotRuntimeSessionRecord[];
  releasedOwners: string[];
} => {
  const upsertCalls: BotRuntimeSessionRecord[] = [];
  const releasedOwners: string[] = [];

  return {
    listEnabledCompanies: async () => companies,
    releaseSessionsByOwner: async (runtimeOwnerId) => {
      releasedOwners.push(runtimeOwnerId);
    },
    upsertSession: async (record) => {
      upsertCalls.push(record);
    },
    releasedOwners,
    upsertCalls,
  };
};

describe("startTenantSessionManager", () => {
  test("starts only enabled tenant sessions and lists them independently", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
    const store = createStoreStub(profiles);
    const startCalls: string[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      startBot: async (options) => {
        startCalls.push(options.runtimeConfig?.sessionKey ?? "missing");
        return {
          getStatus: () => ({
            sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
            state: "initializing",
            attempt: 0,
            hasQr: false,
          }),
          stop: async () => undefined,
        };
      },
    });

    expect(startCalls).toEqual(["company-company-1", "company-company-2"]);
    expect(manager.listSessions().map((session) => session.profile.companyId)).toEqual([
      "company-1",
      "company-2",
    ]);
    expect(manager.getSession("company-1")?.status.sessionKey).toBe("company-company-1");
  });

  test("keeps tenant status isolated when one tenant reconnects and another logs out", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
    const store = createStoreStub(profiles);
    const statusCallbacks = new Map<string, NonNullable<StartBotOptions["onStatusChange"]>>();

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        statusCallbacks.set(sessionKey, options.onStatusChange ?? (() => undefined));

        let currentStatus: BotSessionStatus = {
          sessionKey,
          state: "initializing",
          attempt: 0,
          hasQr: false,
        };

        return {
          getStatus: () => currentStatus,
          stop: async () => undefined,
        } satisfies BotRuntimeHandle;
      },
    });

    await statusCallbacks.get("company-company-1")?.({
      sessionKey: "company-company-1",
      state: "reconnecting",
      attempt: 1,
      hasQr: false,
      disconnectCode: 428,
    });
    await statusCallbacks.get("company-company-2")?.({
      sessionKey: "company-company-2",
      state: "logged_out",
      attempt: 0,
      hasQr: false,
      disconnectCode: 401,
    });

    expect(manager.getSession("company-1")?.status).toEqual({
      sessionKey: "company-company-1",
      state: "reconnecting",
      attempt: 1,
      hasQr: false,
      disconnectCode: 428,
    });
    expect(manager.getSession("company-2")?.status).toEqual({
      sessionKey: "company-company-2",
      state: "logged_out",
      attempt: 0,
      hasQr: false,
      disconnectCode: 401,
    });
  });

  test("persists tenant status changes and heartbeat renewals with a lease", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { timer, intervals } = createIntervalTimerStub();
    const statusCallbacks = new Map<string, NonNullable<StartBotOptions["onStatusChange"]>>();

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      now: () => 1_000,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        statusCallbacks.set(sessionKey, options.onStatusChange ?? (() => undefined));

        return {
          getStatus: () => ({
            sessionKey,
            state: "initializing",
            attempt: 0,
            hasQr: false,
          }),
          stop: async () => undefined,
        };
      },
    });

    await statusCallbacks.get(profile.sessionKey)?.({
      sessionKey: profile.sessionKey,
      state: "open",
      attempt: 0,
      hasQr: false,
    });
    await intervals[0]?.callback();

    expect(store.upsertCalls).toEqual([
      {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: profile.sessionKey,
        state: "initializing",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      },
      {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: profile.sessionKey,
        state: "initializing",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      },
      {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: profile.sessionKey,
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      },
      {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: profile.sessionKey,
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      },
    ]);
    expect(intervals[0]?.delayMs).toBe(20_000);
  });

  test("isolates startup failures so one tenant does not block the others", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
    const store = createStoreStub(profiles);
    const { logger, errorCalls } = createLoggerStub();

    const manager = await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      startBot: async (options) => {
        if (options.runtimeConfig?.sessionKey === "company-company-1") {
          throw new Error("startup failed");
        }

        return {
          getStatus: () => ({
            sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
            state: "open",
            attempt: 0,
            hasQr: false,
          }),
          stop: async () => undefined,
        };
      },
    });

    expect(manager.getSession("company-1")?.status.state).toBe("failed");
    expect(manager.getSession("company-2")?.status.state).toBe("open");
    expect(errorCalls).toEqual([
      {
        payload: {
          companyId: "company-1",
          error: expect.any(Error),
          sessionKey: "company-company-1",
        },
        message: "tenant session startup failed",
      },
    ]);
  });

  test("tears down tenant sessions and releases persisted runtime ownership", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
    const store = createStoreStub(profiles);
    const { timer, intervals } = createIntervalTimerStub();
    const stopped: string[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => ({
        getStatus: () => ({
          sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
          state: "open",
          attempt: 0,
          hasQr: false,
        }),
        stop: async () => {
          stopped.push(options.runtimeConfig?.sessionKey ?? "missing");
        },
      }),
    });

    await manager.stop();

    expect(stopped).toEqual(["company-company-1", "company-company-2"]);
    expect(intervals[0]?.cleared).toBe(true);
    expect(store.releasedOwners).toEqual(["runtime-owner-1"]);
  });
});
