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

const createRuntimeHandle = (
  getStatus: () => BotSessionStatus,
  overrides: Partial<BotRuntimeHandle> = {},
): BotRuntimeHandle => ({
  getStatus,
  presenceSubscribe: async () => undefined,
  sendMessage: async () => ({
    key: {
      id: "sent",
    },
  }),
  sendPresenceUpdate: async () => undefined,
  stop: async () => undefined,
  ...overrides,
});

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
          error: expect.any(Error),
          sessionKey: "company-company-1",
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
          connectTimeoutMs: 20_000,
          keepAliveIntervalMs: 30_000,
          qrTimeoutMs: 60_000,
          markOnlineOnConnect: false,
          syncFullHistory: false,
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
        error: expect.any(Error),
        sessionKey: "company-company-1",
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
        error: expect.any(Error),
        sessionKey: "company-company-1",
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

  test("continues processing tenant inbound events after router failures", async () => {
    const profiles = [createProfile("company-1"), createProfile("company-2")];
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
        error: expect.any(Error),
        sessionKey: "company-company-1",
      },
      message: "tenant inbound message routing failed",
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
    const manager = await startTenantSessionManager({
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
