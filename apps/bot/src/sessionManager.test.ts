import { describe, expect, test } from 'bun:test';
import type {
  IgnoredInboundEvent,
  NormalizedInboundMessage,
  BotRuntimePairingArtifact,
  BotRuntimeSessionRecord,
  CompanyRuntimeProfile,
} from '@cs/shared';
import type { BotPairingStatus, BotRuntimeHandle, BotSessionStatus, StartBotOptions } from './runtime';
import { startTenantSessionManager, type InboundMessageRouter, type SessionManagerStore } from './sessionManager';
import {
  OutboundSequenceError,
  type CreateOutboundMessengerOptions,
  type OutboundMessenger,
} from './outbound';

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
  const warnCalls: Array<{ payload: unknown; message: string }> = [];
  const debugCalls: Array<{ payload: unknown; message: string }> = [];

  const createLogger = (bindings: Record<string, unknown> = {}) => ({
    debug: (payload: unknown, message: string) => {
      debugCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message,
      });
    },
    info: (payload: unknown, message: string) => {
      infoCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message,
      });
    },
    error: (payload: unknown, message: string) => {
      errorCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message,
      });
    },
    warn: (payload: unknown, message: string) => {
      warnCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message,
      });
    },
    child: (childBindings: Record<string, unknown>) => createLogger({ ...bindings, ...childBindings }),
  });

  return {
    logger: createLogger(),
    debugCalls,
    errorCalls,
    infoCalls,
    warnCalls,
  };
};

const createIntervalTimerStub = () => {
  const timeouts: Array<{
    callback: () => void | Promise<void>;
    delayMs: number;
    id: number;
    cleared: boolean;
  }> = [];
  const intervals: Array<{
    callback: () => void | Promise<void>;
    delayMs: number;
    id: number;
    cleared: boolean;
  }> = [];
  let nextId = 1;

  return {
    timer: {
      setTimeout: (callback: () => void | Promise<void>, delayMs: number) => {
        const timeout = {
          callback,
          delayMs,
          id: nextId,
          cleared: false,
        };
        nextId += 1;
        timeouts.push(timeout);
        return timeout.id;
      },
      clearTimeout: (timeoutId: unknown) => {
        const timeout = timeouts.find((entry) => entry.id === timeoutId);
        if (timeout) {
          timeout.cleared = true;
        }
      },
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
    timeouts,
  };
};

const createStoreStub = (
  initialCompanies: CompanyRuntimeProfile[],
): SessionManagerStore & {
  clearedSessions: string[];
  clearedPairingArtifacts: string[];
  companyClearedPairingArtifacts: string[];
  pairingUpsertCalls: BotRuntimePairingArtifact[];
  releasedPairingOwners: string[];
  setCompanies(companies: CompanyRuntimeProfile[]): void;
  upsertCalls: BotRuntimeSessionRecord[];
  releasedOwners: string[];
} => {
  let companies = [...initialCompanies];
  const clearedSessions: string[] = [];
  const clearedPairingArtifacts: string[] = [];
  const companyClearedPairingArtifacts: string[] = [];
  const pairingUpsertCalls: BotRuntimePairingArtifact[] = [];
  const releasedPairingOwners: string[] = [];
  const upsertCalls: BotRuntimeSessionRecord[] = [];
  const releasedOwners: string[] = [];

  return {
    clearSession: async (companyId, runtimeOwnerId) => {
      clearedSessions.push(`${companyId}:${runtimeOwnerId}`);
    },
    clearPairingArtifact: async (companyId, runtimeOwnerId) => {
      clearedPairingArtifacts.push(`${companyId}:${runtimeOwnerId}`);
    },
    clearPairingArtifactsByCompany: async (companyId) => {
      companyClearedPairingArtifacts.push(companyId);
    },
    listEnabledCompanies: async () => companies,
    releasePairingArtifactsByOwner: async (runtimeOwnerId) => {
      releasedPairingOwners.push(runtimeOwnerId);
    },
    releaseSessionsByOwner: async (runtimeOwnerId) => {
      releasedOwners.push(runtimeOwnerId);
    },
    setCompanies: (nextCompanies) => {
      companies = [...nextCompanies];
    },
    upsertPairingArtifact: async (record) => {
      pairingUpsertCalls.push(record);
    },
    upsertSession: async (record) => {
      upsertCalls.push(record);
    },
    clearedSessions,
    clearedPairingArtifacts,
    companyClearedPairingArtifacts,
    pairingUpsertCalls,
    releasedPairingOwners,
    releasedOwners,
    upsertCalls,
  };
};

const createRuntimeHandle = (
  getStatus: () => BotSessionStatus,
  overrides: Partial<BotRuntimeHandle> = {},
): BotRuntimeHandle => ({
  getStatus,
  markRead: overrides.markRead ?? (async () => undefined),
  presenceSubscribe: overrides.presenceSubscribe ?? (async () => undefined),
  sendMessage: overrides.sendMessage ?? (async () => ({
    key: {
      id: "sent",
    },
  })),
  sendPresenceUpdate: overrides.sendPresenceUpdate ?? (async () => undefined),
  stop: overrides.stop ?? (async () => undefined),
});

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
};

const flushTasks = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
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
        return createRuntimeHandle(() => ({
          sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
          state: "initializing",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    expect(startCalls).toEqual(["company-company-1", "company-company-2"]);
    expect(store.companyClearedPairingArtifacts).toEqual(["company-1", "company-2"]);
    expect(manager.listSessions().map((session) => session.profile.companyId)).toEqual([
      "company-1",
      "company-2",
    ]);
    expect(manager.getSession("company-1")?.status.sessionKey).toBe("company-company-1");
  });

  test("clears stale pairing artifacts for the company before starting a runtime", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const cleanupOrder: string[] = [];

    store.clearPairingArtifactsByCompany = async (companyId) => {
      cleanupOrder.push(`startup:${companyId}`);
      store.companyClearedPairingArtifacts.push(companyId);
    };

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      startBot: async () => {
        cleanupOrder.push("startBot");
        return createRuntimeHandle(() => ({
          sessionKey: profile.sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    expect(cleanupOrder).toEqual(["startup:company-1", "startBot"]);
    expect(store.companyClearedPairingArtifacts).toEqual(["company-1"]);
    expect(store.clearedPairingArtifacts).toEqual([]);
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

        return createRuntimeHandle(() => currentStatus);
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

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "initializing",
          attempt: 0,
          hasQr: false,
        }));
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

  test("starts newly enabled tenants on the heartbeat reconcile without restarting the manager", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([]);
    const { timer, intervals } = createIntervalTimerStub();
    const startCalls: string[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      now: () => 1_000,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        startCalls.push(sessionKey);

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "initializing",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    expect(manager.listSessions()).toEqual([]);

    store.setCompanies([profile]);
    await intervals[0]?.callback();
    await flushTasks();

    expect(startCalls).toEqual([profile.sessionKey]);
    expect(manager.listSessions().map((session) => session.profile.companyId)).toEqual(["company-1"]);
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
    ]);
  });

  test("stops disabled tenants on reconcile and clears their persisted runtime state", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { timer, intervals } = createIntervalTimerStub();
    const stopped: string[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }), {
          stop: async () => {
            stopped.push(sessionKey);
          },
        });
      },
    });

    expect(manager.getSession("company-1")?.status.state).toBe("open");

    store.setCompanies([]);
    await intervals[0]?.callback();
    await flushTasks();

    expect(stopped).toEqual([profile.sessionKey]);
    expect(store.companyClearedPairingArtifacts).toEqual(["company-1"]);
    expect(store.clearedSessions).toEqual(["company-1:runtime-owner-1"]);
    expect(store.clearedPairingArtifacts).toEqual(["company-1:runtime-owner-1"]);
    expect(manager.listSessions()).toEqual([]);
  });

  test("keeps the session visible until async shutdown cleanup completes", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { timer, intervals } = createIntervalTimerStub();
    const stopDeferred = createDeferred<void>();
    const clearDeferred = createDeferred<void>();

    store.clearSession = async (companyId, runtimeOwnerId) => {
      store.clearedSessions.push(`${companyId}:${runtimeOwnerId}`);
      await clearDeferred.promise;
    };

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }), {
          stop: async () => {
            await stopDeferred.promise;
          },
        });
      },
    });

    store.setCompanies([]);
    await intervals[0]?.callback();
    await flushTasks();

    expect(manager.getSession("company-1")?.status.state).toBe("open");

    stopDeferred.resolve();
    await flushTasks();

    expect(manager.getSession("company-1")?.status.state).toBe("open");

    clearDeferred.resolve();
    await flushTasks();
    await flushTasks();

    expect(manager.getSession("company-1")).toBeUndefined();
    expect(store.companyClearedPairingArtifacts).toEqual(["company-1"]);
    expect(store.clearedSessions).toEqual(["company-1:runtime-owner-1"]);
    expect(store.clearedPairingArtifacts).toEqual(["company-1:runtime-owner-1"]);
  });

  test("ignores status, pairing, and inbound callbacks after session shutdown begins", async () => {
    const profile = createProfile("company-1", {
      config: {
        accessControlMode: "ALL",
      },
    });
    const store = createStoreStub([profile]);
    const statusCallbacks = new Map<string, NonNullable<StartBotOptions["onStatusChange"]>>();
    const pairingCallbacks = new Map<string, NonNullable<StartBotOptions["onPairingChange"]>>();
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const routedMessages: string[] = [];
    const stopDeferred = createDeferred<void>();

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: {
        handleCustomerConversation: async (message) => {
          routedMessages.push(message.messageId);
        },
        handleIgnored: async () => undefined,
        handleOwnerCommand: async () => undefined,
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        statusCallbacks.set(sessionKey, options.onStatusChange ?? (() => undefined));
        pairingCallbacks.set(sessionKey, options.onPairingChange ?? (() => undefined));
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }), {
          stop: async () => {
            await stopDeferred.promise;
          },
        });
      },
    });

    const stopPromise = manager.stop();
    await Promise.resolve();

    await statusCallbacks.get(profile.sessionKey)?.({
      sessionKey: profile.sessionKey,
      state: "failed",
      attempt: 3,
      hasQr: true,
    });
    await pairingCallbacks.get(profile.sessionKey)?.({
      sessionKey: profile.sessionKey,
      state: "ready",
      updatedAt: 5_000,
      expiresAt: 6_000,
      qrText: "ignored",
    });
    await messageCallbacks.get(profile.sessionKey)?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "ignored-during-stop",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(manager.getSession("company-1")?.status).toEqual({
      sessionKey: "company-company-1",
      state: "open",
      attempt: 0,
      hasQr: false,
    });
    expect(store.pairingUpsertCalls).toEqual([]);
    expect(routedMessages).toEqual([]);

    stopDeferred.resolve();
    await stopPromise;
  });

  test("stops a session handle that finishes startup after manager shutdown begins", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([]);
    const { timer, intervals } = createIntervalTimerStub();
    const startDeferred = createDeferred<BotRuntimeHandle>();
    const stopped: string[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async () => startDeferred.promise,
    });

    store.setCompanies([profile]);
    await intervals[0]?.callback();
    await flushTasks();

    const stopPromise = manager.stop();
    startDeferred.resolve(createRuntimeHandle(() => ({
      sessionKey: profile.sessionKey,
      state: "open",
      attempt: 0,
      hasQr: false,
    }), {
      stop: async () => {
        stopped.push(profile.sessionKey);
      },
    }));

    await stopPromise;

    expect(stopped).toEqual([profile.sessionKey]);
    expect(manager.getSession("company-1")).toBeUndefined();
    expect(manager.getOutbound("company-1")).toBeUndefined();
  });

  test("renews heartbeat even when reconcile fails", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { logger, errorCalls } = createLoggerStub();
    const { timer, intervals } = createIntervalTimerStub();
    let listCalls = 0;

    store.listEnabledCompanies = async () => {
      listCalls += 1;
      if (listCalls === 1) {
        return [profile];
      }

      throw new Error("reconcile failed");
    };

    await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      now: () => 1_000,
      startBot: async (options) => createRuntimeHandle(() => ({
        sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
        state: "open",
        attempt: 0,
        hasQr: false,
      })),
    });

    const upsertCallCountBeforeHeartbeat = store.upsertCalls.length;
    await intervals[0]?.callback();
    await flushTasks();

    expect(store.upsertCalls).toHaveLength(upsertCallCountBeforeHeartbeat + 1);
    expect(errorCalls).toContainEqual({
      payload: {
        error: expect.objectContaining({
          message: "reconcile failed",
          name: "Error",
        }),
        event: "bot.session.reconcile_failed",
        outcome: "error",
        runtime: "bot",
        runtimeOwnerId: "runtime-owner-1",
        surface: "session_manager",
      },
      message: "tenant session reconcile failed",
    });
  });

  test("waits for an in-flight heartbeat before releasing runtime ownership", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { timer, intervals } = createIntervalTimerStub();
    const heartbeatDeferred = createDeferred<void>();
    let blockHeartbeatWrites = false;
    let heartbeatWrites = 0;

    store.upsertSession = async (record) => {
      if (blockHeartbeatWrites && record.state === "open") {
        heartbeatWrites += 1;
        await heartbeatDeferred.promise;
      }

      store.upsertCalls.push(record);
    };

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => createRuntimeHandle(() => ({
        sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
        state: "open",
        attempt: 0,
        hasQr: false,
      })),
    });

    blockHeartbeatWrites = true;
    const heartbeatPromise = intervals[0]?.callback();
    await Promise.resolve();

    const stopPromise = manager.stop();
    await Promise.resolve();

    expect(heartbeatWrites).toBe(1);
    expect(store.releasedOwners).toEqual([]);
    expect(store.clearedSessions).toEqual([]);

    heartbeatDeferred.resolve();
    await heartbeatPromise;
    await stopPromise;

    expect(store.releasedOwners).toEqual(["runtime-owner-1"]);
    expect(store.releasedPairingOwners).toEqual(["runtime-owner-1"]);
  });

  test("skips heartbeat persistence after global stop has begun", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { timer, intervals } = createIntervalTimerStub();

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => createRuntimeHandle(() => ({
        sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
        state: "open",
        attempt: 0,
        hasQr: false,
      })),
    });

    const upsertCallCountBeforeStop = store.upsertCalls.length;
    await manager.stop();

    await intervals[0]?.callback();
    await flushTasks();

    expect(store.upsertCalls).toHaveLength(upsertCallCountBeforeStop);
  });

  test("does not start overlapping reconcile runs on successive heartbeat ticks", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([]);
    const { timer, intervals } = createIntervalTimerStub();
    const startDeferred = createDeferred<BotRuntimeHandle>();
    const startedSessionKeys: string[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => {
        startedSessionKeys.push(options.runtimeConfig?.sessionKey ?? "missing");
        return startDeferred.promise;
      },
    });

    store.setCompanies([profile]);
    await intervals[0]?.callback();
    await flushTasks();
    await intervals[0]?.callback();
    await flushTasks();

    expect(startedSessionKeys).toEqual([profile.sessionKey]);

    startDeferred.resolve(createRuntimeHandle(() => ({
      sessionKey: profile.sessionKey,
      state: "open",
      attempt: 0,
      hasQr: false,
    })));
    await flushTasks();
    await flushTasks();

    expect(manager.getSession("company-1")?.status.state).toBe("open");
  });

  test("refreshes in-memory tenant metadata on reconcile without restarting the session", async () => {
    const profile = createProfile("company-1", {
      config: {
        accessControlMode: "ALL",
      },
    });
    const updatedProfile = createProfile("company-1", {
      config: {
        accessControlMode: "LIST",
        accessControlAllowedNumbers: "967700000003",
      },
      name: "Updated Tenant",
      ownerPhone: "967771408660",
      timezone: "Asia/Aden",
    });
    const store = createStoreStub([profile]);
    const { timer, intervals } = createIntervalTimerStub();
    const startCalls: string[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        startCalls.push(sessionKey);

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    store.setCompanies([updatedProfile]);
    await intervals[0]?.callback();

    expect(startCalls).toEqual([profile.sessionKey]);
    expect(manager.getSession("company-1")?.profile).toEqual(updatedProfile);
  });

  test("retries a failed handle-less startup on a later reconcile", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { timer, intervals } = createIntervalTimerStub();
    const { logger } = createLoggerStub();
    const startCalls: string[] = [];

    await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        startCalls.push(sessionKey);

        if (startCalls.length === 1) {
          throw new Error("startup failed");
        }

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    expect(startCalls).toEqual([profile.sessionKey]);

    await intervals[0]?.callback();
    await flushTasks();

    expect(startCalls).toEqual([profile.sessionKey, profile.sessionKey]);
  });

  test("continues manager startup after the initial reconcile fails", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([]);
    const { logger, errorCalls } = createLoggerStub();
    const { timer, intervals } = createIntervalTimerStub();
    const startCalls: string[] = [];
    let listCalls = 0;

    store.listEnabledCompanies = async () => {
      listCalls += 1;
      if (listCalls === 1) {
        throw new Error("initial reconcile failed");
      }

      return [profile];
    };

    const manager = await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => {
        startCalls.push(options.runtimeConfig?.sessionKey ?? "missing");
        return createRuntimeHandle(() => ({
          sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    expect(manager.listSessions()).toEqual([]);
    expect(intervals).toHaveLength(1);
    expect(errorCalls).toContainEqual({
      payload: {
        error: expect.objectContaining({
          message: "initial reconcile failed",
          name: "Error",
        }),
        event: "bot.session.initial_reconcile_failed",
        outcome: "error",
        runtime: "bot",
        runtimeOwnerId: "runtime-owner-1",
        surface: "session_manager",
      },
      message: "initial tenant session reconcile failed; continuing and letting heartbeat retry",
    });

    await intervals[0]?.callback();
    await flushTasks();

    expect(startCalls).toEqual([profile.sessionKey]);
    expect(manager.listSessions().map((session) => session.profile.companyId)).toEqual(["company-1"]);
  });

  test("retries transient initial reconcile failures before heartbeat fallback", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([]);
    const { logger, errorCalls, warnCalls } = createLoggerStub();
    const { timer, intervals } = createIntervalTimerStub();
    const startCalls: string[] = [];
    let listCalls = 0;

    store.listEnabledCompanies = async () => {
      listCalls += 1;
      if (listCalls === 1) {
        throw new Error(
          "fetch failed",
          {
            cause: new Error(
              "Connect Timeout Error (attempted address: glad-barracuda-955.convex.cloud:443, timeout: 10000ms)",
            ),
          },
        );
      }

      return [profile];
    };

    const manager = await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      startBot: async (options) => {
        startCalls.push(options.runtimeConfig?.sessionKey ?? "missing");
        return createRuntimeHandle(() => ({
          sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    expect(startCalls).toEqual([profile.sessionKey]);
    expect(manager.listSessions().map((session) => session.profile.companyId)).toEqual(["company-1"]);
    expect(intervals).toHaveLength(1);
    expect(warnCalls).toContainEqual({
      payload: {
        attempt: 1,
        error: expect.objectContaining({
          message: "fetch failed",
          name: "Error",
        }),
        event: "bot.session.initial_reconcile_retry_scheduled",
        outcome: "retrying",
        retryDelayMs: 250,
        runtime: "bot",
        runtimeOwnerId: "runtime-owner-1",
        surface: "session_manager",
      },
      message: "initial tenant session reconcile failed; retrying",
    });
    expect(errorCalls).not.toContainEqual(expect.objectContaining({
      payload: expect.objectContaining({
        event: "bot.session.initial_reconcile_failed",
      }),
    }));
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

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "initializing",
          attempt: 0,
          hasQr: false,
        }));
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
    expect(store.companyClearedPairingArtifacts).toEqual(["company-1"]);
    expect(store.clearedPairingArtifacts).toEqual(["company-1:runtime-owner-1"]);
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

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "initializing",
          attempt: 0,
          hasQr: false,
        }));
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
      expiresAt: 9_000,
    });

    expect(infoCalls).toContainEqual({
      payload: {
        companyId: "company-1",
        companyName: "Tenant company-1",
        event: "bot.session.reconnect_scheduled",
        outcome: "scheduled",
        runtime: "bot",
        sessionKey: profile.sessionKey,
        surface: "session",
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
      event: "bot.session.pairing_available",
      outcome: "ready",
      runtime: "bot",
      sessionKey: profile.sessionKey,
      surface: "session",
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
        event: "bot.session.pairing_expired",
        outcome: "expired",
        runtime: "bot",
        sessionKey: profile.sessionKey,
        surface: "session",
        state: "reconnecting",
        attempt: 2,
        disconnectCode: 428,
        pairingState: "expired",
        expiresAt: 9_000,
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
        expiresAt: 9_000,
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

        return createRuntimeHandle(() => ({
          sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    expect(manager.getSession("company-1")?.status.state).toBe("failed");
    expect(manager.getSession("company-2")?.status.state).toBe("open");
    expect(errorCalls).toEqual([
      {
        payload: {
          companyId: "company-1",
          error: expect.objectContaining({
            message: "startup failed",
            name: "Error",
          }),
          event: "bot.session.startup_failed",
          outcome: "failed",
          runtime: "bot",
          sessionKey: "company-company-1",
          surface: "session",
        },
        message: "tenant session startup failed",
      },
    ]);
  });

  test("records and logs runtime config creation failures per tenant", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
    const store = createStoreStub(profiles);
    const { logger, errorCalls } = createLoggerStub();

    const manager = await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      createRuntimeConfig: (overrides) => {
        if (overrides?.sessionKey === "company-company-1") {
          throw new Error("invalid runtime config");
        }

        return {
          sessionKey: overrides?.sessionKey ?? "missing",
          authDir: "/repo/data/bot/auth",
          browser: ["Windows", "CSCB Bot", "1.0.0"],
          conversationHistoryWindowMessages: 20,
          connectTimeoutMs: 20_000,
          keepAliveIntervalMs: 30_000,
          qrTimeoutMs: 60_000,
          markOnlineOnConnect: false,
          syncFullHistory: false,
          inboundReadReceiptDelayMs: {
            min: 2_000,
            max: 4_000,
          },
          reconnectBackoff: {
            initialDelayMs: 1_000,
            maxDelayMs: 30_000,
          },
        };
      },
      startBot: async (options) => createRuntimeHandle(() => ({
        sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
        state: "open",
        attempt: 0,
        hasQr: false,
      })),
    });

    expect(manager.getSession("company-1")?.status).toEqual({
      sessionKey: "company-company-1",
      state: "failed",
      attempt: 0,
      hasQr: false,
    });
    expect(manager.getSession("company-2")?.status.state).toBe("open");
    expect(store.upsertCalls).toContainEqual({
      companyId: "company-1",
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-company-1",
      state: "failed",
      attempt: 0,
      hasQr: false,
      updatedAt: expect.any(Number),
      leaseExpiresAt: expect.any(Number),
    });
    expect(errorCalls).toContainEqual({
      payload: {
        companyId: "company-1",
        error: expect.objectContaining({
          message: "invalid runtime config",
          name: "Error",
        }),
        event: "bot.session.startup_failed",
        outcome: "failed",
        runtime: "bot",
        sessionKey: "company-company-1",
        surface: "session",
      },
      message: "tenant session startup failed",
    });
  });

  test("stops a started tenant handle when outbound setup fails after startup", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const { logger, errorCalls } = createLoggerStub();
    const stopped: string[] = [];

    const manager = await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      createOutboundMessenger: () => {
        throw new Error("outbound setup failed");
      },
      startBot: async (options) => createRuntimeHandle(() => ({
        sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
        state: "open",
        attempt: 0,
        hasQr: false,
      }), {
        stop: async () => {
          stopped.push(options.runtimeConfig?.sessionKey ?? "missing");
        },
      }),
    });

    expect(manager.getSession("company-1")?.status).toEqual({
      sessionKey: "company-company-1",
      state: "failed",
      attempt: 0,
      hasQr: false,
    });
    expect(stopped).toEqual(["company-company-1"]);
    expect(errorCalls).toContainEqual({
      payload: {
        companyId: "company-1",
        error: expect.objectContaining({
          message: "outbound setup failed",
          name: "Error",
        }),
        event: "bot.session.startup_failed",
        outcome: "failed",
        runtime: "bot",
        sessionKey: "company-company-1",
        surface: "session",
      },
      message: "tenant session startup failed",
    });
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
      startBot: async (options) => createRuntimeHandle(() => ({
        sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
        state: "open",
        attempt: 0,
        hasQr: false,
      }), {
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

  test("normalizes tenant inbound messages and routes owner commands before customer conversation flow", async () => {
    const profile = createProfile("company-1", {
      config: {
        accessControlMode: "ALL",
      },
      ownerPhone: "+966 500 000 1",
    });
    const store = createStoreStub([profile]);
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const routedOwnerCommands: NormalizedInboundMessage[] = [];
    const routedConversations: NormalizedInboundMessage[] = [];
    const ignoredEvents: IgnoredInboundEvent[] = [];
    const router: InboundMessageRouter = {
      handleCustomerConversation: async (message) => {
        routedConversations.push(message);
      },
      handleIgnored: async (event) => {
        ignoredEvents.push(event);
      },
      handleOwnerCommand: async (message) => {
        routedOwnerCommands.push(message);
      },
    };

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: router,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get(profile.sessionKey)?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "owner-command",
            remoteJid: "9665000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "!status",
          },
        },
        {
          key: {
            id: "customer-text",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_001,
          message: {
            conversation: "hello",
          },
        },
        {
          key: {
            id: "ignored-group",
            remoteJid: "12345@g.us",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_002,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(routedOwnerCommands.map((message) => message.messageId)).toEqual(["owner-command"]);
    expect(routedConversations.map((message) => message.messageId)).toEqual(["customer-text"]);
    expect(ignoredEvents).toEqual([
      {
        transport: "whatsapp",
        companyId: "company-1",
        sessionKey: profile.sessionKey,
        reason: "group_chat",
        source: {
          upsertType: "notify",
          rawMessageId: "ignored-group",
          remoteJid: "12345@g.us",
          fromMe: false,
        },
      },
    ]);
  });

  test("schedules a delayed read receipt only for accepted customer messages", async () => {
    const profile = createProfile("company-1", {
      config: {
        accessControlMode: "ALL",
      },
      ownerPhone: "+966 500 000 001",
    });
    const store = createStoreStub([profile]);
    const { timer, timeouts } = createIntervalTimerStub();
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const readReceipts: Array<{ id: string; remoteJid: string }> = [];

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      inboundRouter: {
        handleCustomerConversation: async () => undefined,
        handleIgnored: async () => undefined,
        handleOwnerCommand: async () => undefined,
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }), {
          markRead: async (message) => {
            readReceipts.push(message);
          },
        });
      },
    });

    await messageCallbacks.get(profile.sessionKey)?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "owner-command",
            remoteJid: "966500000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "!status",
          },
        },
        {
          key: {
            id: "customer-text",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_001,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    const readReceiptTimeout = timeouts.find((entry) => entry.delayMs >= 2_000 && entry.delayMs <= 4_000);
    expect(readReceiptTimeout).toBeDefined();
    expect(readReceipts).toEqual([]);

    await readReceiptTimeout?.callback();

    expect(readReceipts).toEqual([{
      id: "customer-text",
      remoteJid: "967700000001@s.whatsapp.net",
    }]);
  });

  test("clears pending read receipt timers during shutdown", async () => {
    const profile = createProfile("company-1", {
      config: {
        accessControlMode: "ALL",
      },
    });
    const store = createStoreStub([profile]);
    const { timer, timeouts } = createIntervalTimerStub();
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      timer,
      inboundRouter: {
        handleCustomerConversation: async () => undefined,
        handleIgnored: async () => undefined,
        handleOwnerCommand: async () => undefined,
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get(profile.sessionKey)?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "customer-text",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_001,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.cleared).toBe(false);

    await manager.stop();

    expect(timeouts[0]?.cleared).toBe(true);
  });

  test("continues processing tenant inbound events after router failures", async () => {
    const profiles = [
      createProfile("company-1", {
        config: {
          accessControlMode: "ALL",
        },
      }),
      createProfile("company-2", {
        config: {
          accessControlMode: "ALL",
        },
      }),
    ];
    const store = createStoreStub(profiles);
    const { logger, errorCalls } = createLoggerStub();
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const routedMessages: string[] = [];

    await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: {
        handleCustomerConversation: async (message) => {
          if (message.companyId === "company-1") {
            throw new Error("router failed");
          }

          routedMessages.push(message.messageId);
        },
        handleIgnored: () => undefined,
        handleOwnerCommand: async (message) => {
          routedMessages.push(message.messageId);
        },
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get("company-company-1")?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "company-1-message",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "hello",
          },
        },
      ],
    });
    await messageCallbacks.get("company-company-2")?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "company-2-message",
            remoteJid: "967700000002@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_001,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(routedMessages).toEqual(["company-2-message"]);
    expect(errorCalls).toContainEqual({
      payload: {
        companyId: "company-1",
        error: expect.objectContaining({
          message: "router failed",
          name: "Error",
        }),
        event: "bot.router.routing_failed",
        outcome: "error",
        requestId: "company-1-message",
        route: "customer_conversation",
        runtime: "bot",
        sessionKey: "company-company-1",
        surface: "router",
      },
      message: "tenant inbound message routing failed",
    });
  });

  test("passes tenant route context with profile and outbound messenger isolation", async () => {
    const profiles = [
      createProfile("company-1", {
        config: {
          accessControlMode: "ALL",
        },
      }),
      createProfile("company-2", {
        config: {
          accessControlMode: "ALL",
        },
      }),
    ];
    const store = createStoreStub(profiles);
    const { logger, infoCalls } = createLoggerStub();
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const customerContexts: Array<{
      companyId: string;
      hasOutbound: boolean;
      profileCompanyId: string;
      requestId?: string;
      sessionKey?: string;
      runtime?: string;
      surface?: string;
    }> = [];
    const ownerContexts: Array<{
      companyId: string;
      hasOutbound: boolean;
      profileCompanyId: string;
      requestId?: string;
      sessionKey?: string;
      runtime?: string;
      surface?: string;
    }> = [];
    const ignoredContexts: Array<{
      companyId: string;
      hasOutbound: boolean;
      profileCompanyId: string;
      requestId?: string;
      sessionKey?: string;
      runtime?: string;
      surface?: string;
    }> = [];

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: {
        handleCustomerConversation: async (message, context) => {
          context.logger.info({}, "inspect");
          // Pull the merged bindings back from the shared logger stub.
          const loggerCall = infoCalls.at(-1);
          customerContexts.push({
            companyId: message.companyId,
            hasOutbound: context.outbound !== undefined,
            profileCompanyId: context.profile.companyId,
            requestId: (loggerCall?.payload as Record<string, unknown> | undefined)?.requestId as string | undefined,
            runtime: (loggerCall?.payload as Record<string, unknown> | undefined)?.runtime as string | undefined,
            sessionKey: (loggerCall?.payload as Record<string, unknown> | undefined)?.sessionKey as string | undefined,
            surface: (loggerCall?.payload as Record<string, unknown> | undefined)?.surface as string | undefined,
          });
        },
        handleIgnored: async (event, context) => {
          context.logger.info({}, "inspect");
          const loggerCall = infoCalls.at(-1);
          ignoredContexts.push({
            companyId: event.companyId,
            hasOutbound: context.outbound !== undefined,
            profileCompanyId: context.profile.companyId,
            requestId: (loggerCall?.payload as Record<string, unknown> | undefined)?.requestId as string | undefined,
            runtime: (loggerCall?.payload as Record<string, unknown> | undefined)?.runtime as string | undefined,
            sessionKey: (loggerCall?.payload as Record<string, unknown> | undefined)?.sessionKey as string | undefined,
            surface: (loggerCall?.payload as Record<string, unknown> | undefined)?.surface as string | undefined,
          });
        },
        handleOwnerCommand: async (message, context) => {
          context.logger.info({}, "inspect");
          const loggerCall = infoCalls.at(-1);
          ownerContexts.push({
            companyId: message.companyId,
            hasOutbound: context.outbound !== undefined,
            profileCompanyId: context.profile.companyId,
            requestId: (loggerCall?.payload as Record<string, unknown> | undefined)?.requestId as string | undefined,
            runtime: (loggerCall?.payload as Record<string, unknown> | undefined)?.runtime as string | undefined,
            sessionKey: (loggerCall?.payload as Record<string, unknown> | undefined)?.sessionKey as string | undefined,
            surface: (loggerCall?.payload as Record<string, unknown> | undefined)?.surface as string | undefined,
          });
        },
      },
      logger,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get("company-company-1")?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "owner-command",
            remoteJid: "9665000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "!status",
          },
        },
        {
          key: {
            id: "customer-text",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_001,
          message: {
            conversation: "hello",
          },
        },
        {
          key: {
            id: "ignored-group",
            remoteJid: "12345@g.us",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_002,
          message: {
            conversation: "hello",
          },
        },
      ],
    });
    await messageCallbacks.get("company-company-2")?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "customer-text-company-2",
            remoteJid: "967700000002@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_003,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(ownerContexts).toEqual([{
      companyId: "company-1",
      hasOutbound: true,
      profileCompanyId: "company-1",
      requestId: "owner-command",
      runtime: "bot",
      sessionKey: "company-company-1",
      surface: "router",
    }]);
    expect(customerContexts).toEqual([
      {
        companyId: "company-1",
        hasOutbound: true,
        profileCompanyId: "company-1",
        requestId: "customer-text",
        runtime: "bot",
        sessionKey: "company-company-1",
        surface: "router",
      },
      {
        companyId: "company-2",
        hasOutbound: true,
        profileCompanyId: "company-2",
        requestId: "customer-text-company-2",
        runtime: "bot",
        sessionKey: "company-company-2",
        surface: "router",
      },
    ]);
    expect(ignoredContexts).toEqual([{
      companyId: "company-1",
      hasOutbound: true,
      profileCompanyId: "company-1",
      requestId: "ignored-group",
      runtime: "bot",
      sessionKey: "company-company-1",
      surface: "router",
    }]);
  });

  test("blocks non-owner senders by default before customer routing", async () => {
    const profile = createProfile("company-1");
    const store = createStoreStub([profile]);
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const routedConversations: NormalizedInboundMessage[] = [];
    const ignoredEvents: IgnoredInboundEvent[] = [];

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: {
        handleCustomerConversation: async (message) => {
          routedConversations.push(message);
        },
        handleIgnored: async (event) => {
          ignoredEvents.push(event);
        },
        handleOwnerCommand: async () => undefined,
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get(profile.sessionKey)?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "blocked-customer",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(routedConversations).toEqual([]);
    expect(ignoredEvents).toEqual([{
      transport: "whatsapp",
      companyId: "company-1",
      sessionKey: profile.sessionKey,
      reason: "access_control_blocked",
      source: {
        upsertType: "notify",
        rawMessageId: "blocked-customer",
        remoteJid: "967700000001@s.whatsapp.net",
        fromMe: false,
        accessMode: "OWNER_ONLY",
        accessReason: "access_mode_owner_only",
      },
    }]);
  });

  test("allows the owner command through owner-only access control", async () => {
    const profile = createProfile("company-1", {
      ownerPhone: "+966 500 000 001",
    });
    const store = createStoreStub([profile]);
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const routedOwnerCommands: NormalizedInboundMessage[] = [];
    const ignoredEvents: IgnoredInboundEvent[] = [];

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: {
        handleCustomerConversation: async () => undefined,
        handleIgnored: async (event) => {
          ignoredEvents.push(event);
        },
        handleOwnerCommand: async (message) => {
          routedOwnerCommands.push(message);
        },
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get(profile.sessionKey)?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "owner-command",
            remoteJid: "966500000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "!status",
          },
        },
      ],
    });

    expect(routedOwnerCommands.map((message) => message.messageId)).toEqual(["owner-command"]);
    expect(ignoredEvents).toEqual([]);
  });

  test("allows configured senders and blocks others in single-number and list modes", async () => {
    const profiles = [
      createProfile("company-1", {
        config: {
          accessControlMode: "SINGLE_NUMBER",
          accessControlSingleNumber: "+967 700 000 001",
        },
      }),
      createProfile("company-2", {
        config: {
          accessControlMode: "LIST",
          accessControlAllowedNumbers: "967700000002, +967 700 000 003",
        },
      }),
    ];
    const store = createStoreStub(profiles);
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const routedConversations: string[] = [];
    const ignoredEvents: IgnoredInboundEvent[] = [];

    await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: {
        handleCustomerConversation: async (message) => {
          routedConversations.push(`${message.companyId}:${message.messageId}`);
        },
        handleIgnored: async (event) => {
          ignoredEvents.push(event);
        },
        handleOwnerCommand: async () => undefined,
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get("company-company-1")?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "single-allowed",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "hello",
          },
        },
        {
          key: {
            id: "single-blocked",
            remoteJid: "967700000099@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_001,
          message: {
            conversation: "hello",
          },
        },
      ],
    });
    await messageCallbacks.get("company-company-2")?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "list-allowed",
            remoteJid: "967700000003@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_002,
          message: {
            conversation: "hello",
          },
        },
        {
          key: {
            id: "list-blocked",
            remoteJid: "967700000004@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_003,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(routedConversations).toEqual([
      "company-1:single-allowed",
      "company-2:list-allowed",
    ]);
    expect(ignoredEvents).toEqual([
      {
        transport: "whatsapp",
        companyId: "company-1",
        sessionKey: "company-company-1",
        reason: "access_control_blocked",
        source: {
          upsertType: "notify",
          rawMessageId: "single-blocked",
          remoteJid: "967700000099@s.whatsapp.net",
          fromMe: false,
          accessMode: "SINGLE_NUMBER",
          accessReason: "access_mode_single_number_no_match",
        },
      },
      {
        transport: "whatsapp",
        companyId: "company-2",
        sessionKey: "company-company-2",
        reason: "access_control_blocked",
        source: {
          upsertType: "notify",
          rawMessageId: "list-blocked",
          remoteJid: "967700000004@s.whatsapp.net",
          fromMe: false,
          accessMode: "LIST",
          accessReason: "access_mode_list_no_match",
        },
      },
    ]);
  });

  test("fails safe for malformed access-control config and logs a warning", async () => {
    const profile = createProfile("company-1", {
      config: {
        accessControlMode: "SINGLE_NUMBER",
        accessControlSingleNumber: "owner",
      },
    });
    const store = createStoreStub([profile]);
    const { logger, warnCalls } = createLoggerStub();
    const messageCallbacks = new Map<string, NonNullable<StartBotOptions["onMessagesUpsert"]>>();
    const ignoredEvents: IgnoredInboundEvent[] = [];

    await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      inboundRouter: {
        handleCustomerConversation: async () => undefined,
        handleIgnored: async (event) => {
          ignoredEvents.push(event);
        },
        handleOwnerCommand: async () => undefined,
      },
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";
        messageCallbacks.set(sessionKey, options.onMessagesUpsert ?? (() => undefined));

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }));
      },
    });

    await messageCallbacks.get(profile.sessionKey)?.({
      type: "notify",
      messages: [
        {
          key: {
            id: "blocked-customer",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: 1_700_000_000,
          message: {
            conversation: "hello",
          },
        },
      ],
    });

    expect(ignoredEvents).toEqual([{
      transport: "whatsapp",
      companyId: "company-1",
      sessionKey: profile.sessionKey,
      reason: "access_control_blocked",
      source: {
        upsertType: "notify",
        rawMessageId: "blocked-customer",
        remoteJid: "967700000001@s.whatsapp.net",
        fromMe: false,
        accessMode: "OWNER_ONLY",
        accessReason: "access_mode_single_number_invalid",
      },
    }]);
    expect(warnCalls).toContainEqual({
      payload: {
        event: "bot.router.inbound_ignored",
        runtime: "bot",
        surface: "router",
        outcome: "ignored",
        companyId: "company-1",
        reason: "access_control_blocked",
        sessionKey: profile.sessionKey,
        requestId: "blocked-customer",
        messageId: "blocked-customer",
        remoteJid: "***0001@s.whatsapp.net",
        accessMode: "OWNER_ONLY",
        accessReason: "access_mode_single_number_invalid",
      },
      message: "tenant inbound event ignored",
    });
  });

  test("exposes isolated tenant outbound messengers through the session manager", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
    const store = createStoreStub(profiles);
    const outboundBySessionKey = new Map<string, OutboundMessenger>();
    const createdOutboundOptions: CreateOutboundMessengerOptions[] = [];

    const manager = await startTenantSessionManager({
      runtimeOwnerId: "runtime-owner-1",
      store,
      createOutboundMessenger: (options) => {
        const transport = options.transport as BotRuntimeHandle;
        createdOutboundOptions.push(options);
        const messenger: OutboundMessenger = {
          sendMedia: async () => [],
          sendSequence: async () => [],
          sendText: async () => [{
            attempts: 1,
            kind: "text",
            recipientJid: transport.getStatus().sessionKey,
            stepIndex: 0,
          }],
        };
        outboundBySessionKey.set(transport.getStatus().sessionKey, messenger);
        return messenger;
      },
      startBot: async (options) => createRuntimeHandle(() => ({
        sessionKey: options.runtimeConfig?.sessionKey ?? "missing",
        state: "open",
        attempt: 0,
        hasQr: false,
      })),
    });

    const company1Outbound = manager.getOutbound("company-1");
    const company2Outbound = manager.getOutbound("company-2");

    expect(createdOutboundOptions).toHaveLength(2);
    expect(company1Outbound).toBe(outboundBySessionKey.get("company-company-1"));
    expect(company2Outbound).toBe(outboundBySessionKey.get("company-company-2"));
    expect(company1Outbound).not.toBe(company2Outbound);
  });

  test("keeps tenant outbound lookup isolated when one tenant sender fails", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
    const store = createStoreStub(profiles);
    const { logger } = createLoggerStub();
    const manager = await startTenantSessionManager({
      logger,
      runtimeOwnerId: "runtime-owner-1",
      store,
      startBot: async (options) => {
        const sessionKey = options.runtimeConfig?.sessionKey ?? "missing";

        return createRuntimeHandle(() => ({
          sessionKey,
          state: "open",
          attempt: 0,
          hasQr: false,
        }), {
          presenceSubscribe: async () => undefined,
          sendMessage: async () => {
            if (sessionKey === "company-company-1") {
              throw new Error("send failed");
            }

            return { key: { id: "company-2-sent" } };
          },
          sendPresenceUpdate: async () => undefined,
        });
      },
    });

    await expect(manager.getOutbound("company-1")?.sendText({
      recipientJid: "967700000001@s.whatsapp.net",
      text: "hello",
    }) ?? Promise.reject(new Error("missing outbound"))).rejects.toMatchObject({
      classification: "unknown",
      stepIndex: 0,
      attempts: 1,
      sentReceipts: [],
      cause: expect.objectContaining({
        message: "send failed",
      }),
    } satisfies Partial<OutboundSequenceError>);

    await expect(manager.getOutbound("company-2")?.sendText({
      recipientJid: "967700000002@s.whatsapp.net",
      text: "hello",
    }) ?? Promise.reject(new Error("missing outbound"))).resolves.toEqual([
      {
        attempts: 1,
        kind: "text",
        messageId: "company-2-sent",
        recipientJid: "967700000002@s.whatsapp.net",
        stepIndex: 0,
      },
    ]);

    expect(manager.getOutbound("company-1")).toBeDefined();
    expect(manager.getOutbound("company-2")).toBeDefined();
  });
});
