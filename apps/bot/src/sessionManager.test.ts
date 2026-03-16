import { describe, expect, test } from 'bun:test';
import type {
  BotRuntimePairingArtifact,
  BotRuntimeSessionRecord,
  CompanyRuntimeProfile,
} from '@cs/shared';
import type { BotPairingStatus, BotRuntimeHandle, BotSessionStatus, StartBotOptions } from './runtime';
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
  clearedPairingArtifacts: string[];
  pairingUpsertCalls: BotRuntimePairingArtifact[];
  releasedPairingOwners: string[];
  upsertCalls: BotRuntimeSessionRecord[];
  releasedOwners: string[];
} => {
  const clearedPairingArtifacts: string[] = [];
  const pairingUpsertCalls: BotRuntimePairingArtifact[] = [];
  const releasedPairingOwners: string[] = [];
  const upsertCalls: BotRuntimeSessionRecord[] = [];
  const releasedOwners: string[] = [];

  return {
    clearPairingArtifact: async (companyId) => {
      clearedPairingArtifacts.push(companyId);
    },
    listEnabledCompanies: async () => companies,
    releasePairingArtifactsByOwner: async (runtimeOwnerId) => {
      releasedPairingOwners.push(runtimeOwnerId);
    },
    releaseSessionsByOwner: async (runtimeOwnerId) => {
      releasedOwners.push(runtimeOwnerId);
    },
    upsertPairingArtifact: async (record) => {
      pairingUpsertCalls.push(record);
    },
    upsertSession: async (record) => {
      upsertCalls.push(record);
    },
    clearedPairingArtifacts,
    pairingUpsertCalls,
    releasedPairingOwners,
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

  test("persists ready QR artifacts and clears them when pairing is removed", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const pairingCallbacks = new Map<string, NonNullable<StartBotOptions["onPairingChange"]>>();

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        pairingCallbacks.set(sessionKey, options.onPairingChange ?? (() => undefined));

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

    await pairingCallbacks.get(profile.sessionKey)?.({
      sessionKey: profile.sessionKey,
      state: "ready",
      qrText: "tenant-qr",
      updatedAt: 1_000,
      expiresAt: 61_000,
    } satisfies BotPairingStatus);
    await pairingCallbacks.get(profile.sessionKey)?.({
      sessionKey: profile.sessionKey,
      state: "none",
      updatedAt: 2_000,
    } satisfies BotPairingStatus);

    expect(store.pairingUpsertCalls).toEqual([
      {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: profile.sessionKey,
        qrText: "tenant-qr",
        updatedAt: 1_000,
        expiresAt: 61_000,
      },
    ]);
    expect(store.clearedPairingArtifacts).toEqual(["company-1", "company-1"]);
  });

  test("logs reconnect scheduling and pairing visibility with tenant context", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { logger, infoCalls } = createLoggerStub();
    const statusCallbacks = new Map<string, NonNullable<StartBotOptions["onStatusChange"]>>();
    const pairingCallbacks = new Map<string, NonNullable<StartBotOptions["onPairingChange"]>>();

    await startTenantSessionManager({
      logger,
      now: () => 10_000,
      runtimeOwnerId: "runtime-owner-1",
      store,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        statusCallbacks.set(sessionKey, options.onStatusChange ?? (() => undefined));
        pairingCallbacks.set(sessionKey, options.onPairingChange ?? (() => undefined));

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
      state: "reconnecting",
      attempt: 2,
      hasQr: false,
      disconnectCode: 428,
    });
    await pairingCallbacks.get(profile.sessionKey)?.({
      sessionKey: profile.sessionKey,
      state: "ready",
      qrText: "tenant-qr",
      updatedAt: 12_000,
      expiresAt: 72_000,
    });
    await pairingCallbacks.get(profile.sessionKey)?.({
      sessionKey: profile.sessionKey,
      state: "expired",
      qrText: "tenant-qr",
      updatedAt: 73_000,
      expiresAt: 72_000,
    });

    expect(infoCalls).toContainEqual({
      payload: {
        companyId: "company-1",
        companyName: "Tenant company-1",
        sessionKey: profile.sessionKey,
        state: "reconnecting",
        attempt: 2,
        disconnectCode: 428,
        pairingState: "none",
        nextRetryAt: 12_000,
        operatorState: "reconnecting",
        summary: "Bot session is reconnecting after a transient disconnect.",
        nextActionHint: "Wait for the reconnect backoff window to elapse or inspect the disconnect code.",
      },
      message: "bot reconnect scheduled",
    });

    const pairingLog = infoCalls.find((entry) => entry.message === "bot pairing available");
    expect(pairingLog).toBeDefined();
    expect(JSON.stringify(pairingLog)).not.toContain("tenant-qr");
    expect(pairingLog?.payload).toEqual({
      companyId: "company-1",
      companyName: "Tenant company-1",
      sessionKey: profile.sessionKey,
      state: "reconnecting",
      attempt: 2,
      disconnectCode: 428,
      pairingState: "ready",
      expiresAt: 72_000,
      operatorState: "reconnecting",
      summary: "Bot session is reconnecting after a transient disconnect.",
      nextActionHint: "Wait for the reconnect backoff window to elapse or inspect the disconnect code.",
      operatorUrl: "http://127.0.0.1:3000/runtime/bot?companyId=company-1",
    });

    expect(infoCalls).toContainEqual({
      payload: {
        companyId: "company-1",
        companyName: "Tenant company-1",
        sessionKey: profile.sessionKey,
        state: "reconnecting",
        attempt: 2,
        disconnectCode: 428,
        pairingState: "expired",
        expiresAt: 72_000,
        operatorState: "reconnecting",
        summary: "Bot session is reconnecting after a transient disconnect.",
        nextActionHint: "Wait for the reconnect backoff window to elapse or inspect the disconnect code.",
      },
      message: "bot pairing expired",
    });
    expect(store.pairingUpsertCalls).toEqual([
      {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: profile.sessionKey,
        qrText: "tenant-qr",
        updatedAt: 12_000,
        expiresAt: 72_000,
      },
      {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: profile.sessionKey,
        qrText: "tenant-qr",
        updatedAt: 73_000,
        expiresAt: 72_000,
      },
    ]);
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
    expect(store.releasedPairingOwners).toEqual(["runtime-owner-1"]);
  });
});
