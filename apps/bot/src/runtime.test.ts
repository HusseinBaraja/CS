import { describe, expect, test } from 'bun:test';
import type { AuthenticationState, BaileysEventMap, UserFacingSocketConfig } from './baileys';
import { type BotConnectionUpdate, type BotPairingStatus, type BotSocket, startBot } from './runtime';
import { createBotRuntimeConfig } from './runtimeConfig';

type RegisteredHandler = () => void | Promise<void>;

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createLoggerStub = () => {
  const infoCalls: Array<{ payload: unknown; message: string }> = [];
  const errorCalls: Array<{ payload: unknown; message: string }> = [];
  const warnCalls: Array<{ payload: unknown; message: string }> = [];

  return {
    logger: {
      info: (payload: unknown, message: string) => {
        infoCalls.push({ payload, message });
      },
      warn: (payload: unknown, message: string) => {
        warnCalls.push({ payload, message });
      },
      error: (payload: unknown, message: string) => {
        errorCalls.push({ payload, message });
      },
    },
    infoCalls,
    warnCalls,
    errorCalls,
  };
};

const createProcessStub = () => {
  const handlers = new Map<string, RegisteredHandler>();

  return {
    process: {
      exitCode: undefined as number | undefined,
      once: (event: string, handler: RegisteredHandler) => {
        handlers.set(event, handler);
        return undefined as never;
      },
    },
    handlers,
  };
};

const createTimerStub = () => {
  const scheduled: Array<{
    callback: () => void;
    delayMs: number;
    id: number;
    cleared: boolean;
  }> = [];
  let nextId = 1;

  return {
    timer: {
      setTimeout: (callback: () => void, delayMs: number) => {
        const timerEntry = {
          callback,
          delayMs,
          id: nextId,
          cleared: false,
        };
        nextId += 1;
        scheduled.push(timerEntry);
        return timerEntry.id;
      },
      clearTimeout: (timeoutId: unknown) => {
        const timerEntry = scheduled.find((entry) => entry.id === timeoutId);
        if (timerEntry) {
          timerEntry.cleared = true;
        }
      },
    },
    scheduled,
  };
};

const createAuthenticationState = (): AuthenticationState =>
  ({}) as AuthenticationState;

const createSocketStub = () => {
  const connectionHandlers: Array<(update: BotConnectionUpdate) => void> = [];
  const credsHandlers: Array<(update: unknown) => void> = [];
  const messagesUpsertHandlers: Array<(update: BaileysEventMap["messages.upsert"]) => void> = [];
  const endCalls: unknown[] = [];
  const sendCalls: Array<{ recipientJid: string; message: unknown }> = [];
  const presenceSubscribeCalls: string[] = [];
  const presenceUpdateCalls: Array<{ state: "composing" | "paused"; recipientJid: string }> = [];

  const socket: BotSocket = {
    ev: {
      on: (event, handler) => {
        if (event === "connection.update") {
          connectionHandlers.push(handler as (update: BotConnectionUpdate) => void);
          return;
        }

        if (event === "messages.upsert") {
          messagesUpsertHandlers.push(handler as (update: BaileysEventMap["messages.upsert"]) => void);
          return;
        }

        credsHandlers.push(handler as (update: unknown) => void);
      },
    },
    end: (error) => {
      endCalls.push(error);
    },
    presenceSubscribe: async (recipientJid) => {
      presenceSubscribeCalls.push(recipientJid);
    },
    sendMessage: async (recipientJid, message) => {
      sendCalls.push({ recipientJid, message });
      return {
        key: {
          id: `sent-${sendCalls.length}`,
        },
      };
    },
    sendPresenceUpdate: async (state, recipientJid) => {
      presenceUpdateCalls.push({ state, recipientJid });
    },
  };

  return {
    socket,
    emitConnectionUpdate: (update: BotConnectionUpdate) => {
      for (const handler of connectionHandlers) {
        handler(update);
      }
    },
    emitCredsUpdate: (update: unknown) => {
      for (const handler of credsHandlers) {
        handler(update);
      }
    },
    emitMessagesUpsert: (update: BaileysEventMap["messages.upsert"]) => {
      for (const handler of messagesUpsertHandlers) {
        handler(update);
      }
    },
    endCalls,
    presenceSubscribeCalls,
    presenceUpdateCalls,
    sendCalls,
  };
};

describe("startBot", () => {
  test("loads auth state before creating the socket and registers shutdown handlers", async () => {
    const events: string[] = [];
    const { logger } = createLoggerStub();
    const { process, handlers } = createProcessStub();
    const runtimeConfig = createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" });
    const socketStub = createSocketStub();
    const receivedConfigs: UserFacingSocketConfig[] = [];
    const version = [2, 3001, 999999999] as [number, number, number];

    const handle = await startBot({
      logger,
      runtimeConfig,
      botProcess: process,
      resolveSocketVersion: async () => version,
      loadAuthState: async () => {
        events.push("auth");
        return {
          state: createAuthenticationState(),
          saveCreds: async () => undefined,
          sessionPath: "/repo/data/bot/auth/default",
        };
      },
      createSocket: (config) => {
        events.push("socket");
        receivedConfigs.push(config);
        return socketStub.socket;
      },
    });

    expect(events).toEqual(["auth", "socket"]);
    expect(Array.from(handlers.keys()).sort()).toEqual(["SIGINT", "SIGTERM"]);
    expect(receivedConfigs).toHaveLength(1);
    expect(receivedConfigs[0]?.markOnlineOnConnect).toBe(false);
    expect(receivedConfigs[0]?.syncFullHistory).toBe(false);
    expect(receivedConfigs[0]?.browser).toEqual(runtimeConfig.browser);
    expect(receivedConfigs[0]?.version).toEqual(version);
    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "initializing",
      attempt: 0,
      hasQr: false,
    });
  });

  test("emits status updates to the optional status callback", async () => {
    const { logger } = createLoggerStub();
    const socketStub = createSocketStub();
    const statusChanges: Array<{ sessionKey: string; state: string }> = [];

    await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({
        moduleDirectory: "/repo/apps/bot/src",
        sessionKey: "company-Y29tcGFueS0x",
      }),
      onStatusChange: (status) => {
        statusChanges.push({
          sessionKey: status.sessionKey,
          state: status.state,
        });
      },
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/company-Y29tcGFueS0x",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({ connection: "connecting" });
    socketStub.emitConnectionUpdate({ connection: "open" });
    await flushPromises();

    expect(statusChanges).toEqual([
      {
        sessionKey: "company-Y29tcGFueS0x",
        state: "initializing",
      },
      {
        sessionKey: "company-Y29tcGFueS0x",
        state: "connecting",
      },
      {
        sessionKey: "company-Y29tcGFueS0x",
        state: "open",
      },
    ]);
  });

  test("tracks connecting, pairing, and open lifecycle transitions without logging raw QR data", async () => {
    const { logger, infoCalls } = createLoggerStub();
    const runtimeConfig = createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" });
    const socketStub = createSocketStub();

    const handle = await startBot({
      logger,
      runtimeConfig,
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({ connection: "connecting" });
    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "connecting",
      attempt: 0,
      hasQr: false,
    });

    socketStub.emitConnectionUpdate({ qr: "raw-qr-value" });
    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "awaiting_pairing",
      attempt: 0,
      hasQr: true,
    });

    socketStub.emitConnectionUpdate({ connection: "open", isNewLogin: true });
    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "open",
      attempt: 0,
      hasQr: false,
      isNewLogin: true,
    });

    const serializedLogs = JSON.stringify(infoCalls);
    expect(serializedLogs).not.toContain("raw-qr-value");
  });

  test("emits pairing callbacks when a QR is created and clears them after open", async () => {
    const { logger } = createLoggerStub();
    const socketStub = createSocketStub();
    let currentNow = 1_000;
    const pairingChanges: BotPairingStatus[] = [];

    await startBot({
      logger,
      now: () => currentNow,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      onPairingChange: (pairing) => {
        pairingChanges.push(pairing);
      },
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({ qr: "ready-qr" });
    currentNow = 2_000;
    socketStub.emitConnectionUpdate({ connection: "open" });
    await flushPromises();

    expect(pairingChanges).toEqual([
      {
        sessionKey: "default",
        state: "ready",
        qrText: "ready-qr",
        updatedAt: 1_000,
        expiresAt: 61_000,
      },
      {
        sessionKey: "default",
        state: "none",
        updatedAt: 2_000,
      },
    ]);
  });

  test("expires QR pairing exactly once and marks the session as awaiting pairing without an active QR", async () => {
    const { logger } = createLoggerStub();
    const { timer, scheduled } = createTimerStub();
    const socketStub = createSocketStub();
    let currentNow = 5_000;
    const pairingChanges: BotPairingStatus[] = [];

    const handle = await startBot({
      logger,
      now: () => currentNow,
      timer,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      onPairingChange: (pairing) => {
        pairingChanges.push(pairing);
      },
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({ qr: "expiring-qr" });
    currentNow = 66_000;
    scheduled[0]?.callback();
    scheduled[0]?.callback();
    await flushPromises();

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "awaiting_pairing",
      attempt: 0,
      hasQr: false,
    });
    expect(pairingChanges).toEqual([
      {
        sessionKey: "default",
        state: "ready",
        qrText: "expiring-qr",
        updatedAt: 5_000,
        expiresAt: 65_000,
      },
      {
        sessionKey: "default",
        state: "expired",
        updatedAt: 66_000,
        expiresAt: 65_000,
        qrText: "expiring-qr",
      },
    ]);
  });

  test("dedupes identical QR updates", async () => {
    const { logger } = createLoggerStub();
    const socketStub = createSocketStub();
    const pairingChanges: BotPairingStatus[] = [];

    await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      onPairingChange: (pairing) => {
        pairingChanges.push(pairing);
      },
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({ qr: "same-qr" });
    socketStub.emitConnectionUpdate({ qr: "same-qr" });
    await flushPromises();

    expect(pairingChanges).toEqual([
      {
        sessionKey: "default",
        state: "ready",
        qrText: "same-qr",
        updatedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
    ]);
  });

  test("persists creds on updates", async () => {
    const { logger } = createLoggerStub();
    const socketStub = createSocketStub();
    let saveCredsCallCount = 0;

    await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => {
          saveCredsCallCount += 1;
        },
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitCredsUpdate({ me: { id: "user" } });
    await flushPromises();

    expect(saveCredsCallCount).toBe(1);
  });

  test("forwards inbound message upserts to the optional callback", async () => {
    const { logger } = createLoggerStub();
    const socketStub = createSocketStub();
    const messageEvents: BaileysEventMap["messages.upsert"][] = [];

    await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      onMessagesUpsert: (event) => {
        messageEvents.push(event);
      },
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitMessagesUpsert({
      type: "notify",
      messages: [
        {
          key: {
            id: "message-1",
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
    await flushPromises();

    expect(messageEvents).toEqual([
      {
        type: "notify",
        messages: [
          {
            key: {
              id: "message-1",
              remoteJid: "967700000001@s.whatsapp.net",
              fromMe: false,
            },
            messageTimestamp: 1_700_000_000,
            message: {
              conversation: "hello",
            },
          },
        ],
      },
    ]);
  });

  test("exposes outbound transport methods while the socket is open", async () => {
    const { logger } = createLoggerStub();
    const socketStub = createSocketStub();

    const handle = await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({ connection: "open" });

    await handle.presenceSubscribe("967700000001@s.whatsapp.net");
    await handle.sendPresenceUpdate("composing", "967700000001@s.whatsapp.net");
    const result = await handle.sendMessage("967700000001@s.whatsapp.net", {
      text: "Hello",
    });

    expect(socketStub.presenceSubscribeCalls).toEqual(["967700000001@s.whatsapp.net"]);
    expect(socketStub.presenceUpdateCalls).toEqual([
      {
        state: "composing",
        recipientJid: "967700000001@s.whatsapp.net",
      },
    ]);
    expect(socketStub.sendCalls).toEqual([
      {
        recipientJid: "967700000001@s.whatsapp.net",
        message: {
          text: "Hello",
        },
      },
    ]);
    expect(result).toEqual({
      key: {
        id: "sent-1",
      },
    });
  });

  test("rejects outbound transport calls when the socket is not open", async () => {
    const { logger } = createLoggerStub();
    const socketStub = createSocketStub();

    const handle = await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    await expect(handle.sendMessage("967700000001@s.whatsapp.net", { text: "Hello" })).rejects.toThrow(
      "Bot socket is unavailable for outbound sends",
    );
    await expect(handle.presenceSubscribe("967700000001@s.whatsapp.net")).rejects.toThrow(
      "Bot socket is unavailable for presence subscription",
    );
    await expect(handle.sendPresenceUpdate("paused", "967700000001@s.whatsapp.net")).rejects.toThrow(
      "Bot socket is unavailable for presence updates",
    );
  });

  test("logs inbound callback failures without shutting down the runtime", async () => {
    const { logger, errorCalls } = createLoggerStub();
    const socketStub = createSocketStub();

    const handle = await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      onMessagesUpsert: async () => {
        throw new Error("inbound failed");
      },
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitMessagesUpsert({
      type: "notify",
      messages: [
        {
          key: {
            id: "message-1",
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
    await flushPromises();

    expect(handle.getStatus().state).toBe("initializing");
    expect(socketStub.endCalls).toEqual([]);
    expect(errorCalls).toContainEqual({
      payload: {
        error: expect.any(Error),
        sessionKey: "default",
      },
      message: "bot inbound message callback failed",
    });
  });

  test("reconnects after transient close reasons with exponential backoff and resets after open", async () => {
    const { logger } = createLoggerStub();
    const { timer, scheduled } = createTimerStub();
    const runtimeConfig = createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" });
    const firstSocket = createSocketStub();
    const secondSocket = createSocketStub();
    const thirdSocket = createSocketStub();
    const socketStubs = [firstSocket, secondSocket, thirdSocket];
    const receivedConfigs: UserFacingSocketConfig[] = [];

    const handle = await startBot({
      logger,
      runtimeConfig,
      timer,
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: (config) => {
        receivedConfigs.push(config);
        const nextSocket = socketStubs.shift();
        if (!nextSocket) {
          throw new Error("unexpected socket creation");
        }

        return nextSocket.socket;
      },
    });

    firstSocket.emitConnectionUpdate({
      connection: "close",
      lastDisconnect: {
        error: {
          output: { statusCode: 428 },
        },
      },
    });

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "reconnecting",
      attempt: 1,
      hasQr: false,
      disconnectCode: 428,
    });
    expect(scheduled[0]?.delayMs).toBe(1_000);

    scheduled[0]?.callback();
    expect(receivedConfigs).toHaveLength(2);

    secondSocket.emitConnectionUpdate({
      connection: "close",
      lastDisconnect: {
        error: {
          output: { statusCode: 503 },
        },
      },
    });

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "reconnecting",
      attempt: 2,
      hasQr: false,
      disconnectCode: 503,
    });
    expect(scheduled[1]?.delayMs).toBe(2_000);

    scheduled[1]?.callback();
    thirdSocket.emitConnectionUpdate({ connection: "open" });
    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "open",
      attempt: 0,
      hasQr: false,
    });
  });

  test("ignores late events from a superseded socket after reconnecting", async () => {
    const { logger } = createLoggerStub();
    const { timer, scheduled } = createTimerStub();
    const firstSocket = createSocketStub();
    const secondSocket = createSocketStub();
    let saveCredsCallCount = 0;

    const handle = await startBot({
      logger,
      timer,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => {
          saveCredsCallCount += 1;
        },
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: (() => {
        const sockets = [firstSocket.socket, secondSocket.socket];
        return () => {
          const nextSocket = sockets.shift();
          if (!nextSocket) {
            throw new Error("unexpected socket creation");
          }

          return nextSocket;
        };
      })(),
    });

    firstSocket.emitConnectionUpdate({
      connection: "close",
      lastDisconnect: {
        error: {
          output: { statusCode: 428 },
        },
      },
    });
    scheduled[0]?.callback();
    secondSocket.emitConnectionUpdate({ connection: "open" });

    firstSocket.emitConnectionUpdate({ connection: "close" });
    firstSocket.emitConnectionUpdate({ connection: "open" });
    firstSocket.emitCredsUpdate({ me: { id: "stale-user" } });
    await flushPromises();

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "open",
      attempt: 0,
      hasQr: false,
    });
    expect(saveCredsCallCount).toBe(0);
  });

  test("reschedules reconnect attempts when socket creation throws inside the reconnect timer", async () => {
    const { logger, errorCalls } = createLoggerStub();
    const { timer, scheduled } = createTimerStub();
    const firstSocket = createSocketStub();
    const secondSocket = createSocketStub();
    let createSocketCalls = 0;

    const handle = await startBot({
      logger,
      timer,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => {
        createSocketCalls += 1;
        if (createSocketCalls === 1) {
          return firstSocket.socket;
        }

        if (createSocketCalls === 2) {
          throw new Error("reconnect socket failed");
        }

        return secondSocket.socket;
      },
    });

    firstSocket.emitConnectionUpdate({
      connection: "close",
      lastDisconnect: {
        error: {
          output: { statusCode: 428 },
        },
      },
    });

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "reconnecting",
      attempt: 1,
      hasQr: false,
      disconnectCode: 428,
    });
    expect(scheduled[0]?.delayMs).toBe(1_000);

    scheduled[0]?.callback();

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "reconnecting",
      attempt: 2,
      hasQr: false,
      disconnectCode: 428,
    });
    expect(scheduled[1]?.delayMs).toBe(2_000);
    expect(errorCalls).toContainEqual({
      payload: {
        error: expect.any(Error),
        sessionKey: "default",
      },
      message: "bot reconnect attempt failed",
    });

    scheduled[1]?.callback();
    secondSocket.emitConnectionUpdate({ connection: "open" });

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "open",
      attempt: 0,
      hasQr: false,
    });
  });

  test("does not reconnect for terminal close reasons", async () => {
    const { logger } = createLoggerStub();
    const { timer, scheduled } = createTimerStub();
    const socketStub = createSocketStub();

    const handle = await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      timer,
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({
      connection: "close",
      lastDisconnect: {
        error: {
          output: { statusCode: 401 },
        },
      },
    });

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "logged_out",
      attempt: 0,
      hasQr: false,
      disconnectCode: 401,
    });
    expect(scheduled).toEqual([]);
  });

  test("suppresses pending reconnects after shutdown", async () => {
    const { logger } = createLoggerStub();
    const { timer, scheduled } = createTimerStub();
    const { process, handlers } = createProcessStub();
    const socketStub = createSocketStub();

    const handle = await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      timer,
      botProcess: process,
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitConnectionUpdate({
      connection: "close",
      lastDisconnect: {
        error: {
          output: { statusCode: 428 },
        },
      },
    });

    await handlers.get("SIGINT")?.();
    expect(socketStub.endCalls).toEqual([]);
    expect(scheduled[0]?.cleared).toBe(true);

    await handle.stop();
    expect(socketStub.endCalls).toEqual([]);
  });

  test("calls the stop path only once across multiple shutdown signals", async () => {
    const { logger } = createLoggerStub();
    const { process, handlers } = createProcessStub();
    const socketStub = createSocketStub();

    await startBot({
      logger,
      botProcess: process,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    await handlers.get("SIGINT")?.();
    await handlers.get("SIGTERM")?.();

    expect(socketStub.endCalls).toEqual([undefined]);
  });

  test("skips process signal registration when requested", async () => {
    const { logger } = createLoggerStub();
    const { process, handlers } = createProcessStub();

    await startBot({
      logger,
      botProcess: process,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      registerProcessHandlers: false,
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => createSocketStub().socket,
    });

    expect(handlers.size).toBe(0);
  });

  test("fails startup when auth state loading fails", async () => {
    const { logger } = createLoggerStub();

    await expect(startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => {
        throw new Error("auth failed");
      },
    })).rejects.toThrow("auth failed");
  });

  test("fails startup when the socket factory throws", async () => {
    const { logger } = createLoggerStub();

    await expect(startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => {
        throw new Error("socket failed");
      },
    })).rejects.toThrow("socket failed");
  });

  test("treats auth persistence failures as fatal and marks the process exit code", async () => {
    const { logger, errorCalls } = createLoggerStub();
    const { process } = createProcessStub();
    const socketStub = createSocketStub();

    const handle = await startBot({
      logger,
      botProcess: process,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => {
          throw new Error("save failed");
        },
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: () => socketStub.socket,
    });

    socketStub.emitCredsUpdate({ me: { id: "user" } });
    await flushPromises();

    expect(handle.getStatus()).toEqual({
      sessionKey: "default",
      state: "failed",
      attempt: 0,
      hasQr: false,
    });
    expect(process.exitCode).toBe(1);
    expect(socketStub.endCalls).toEqual([undefined]);
    expect(errorCalls).toEqual([
      {
        payload: {
          sessionKey: "default",
          error: expect.any(Error),
        },
        message: "bot auth state persistence failed",
      },
    ]);
  });

  test("falls back to the bundled socket version when live version resolution fails", async () => {
    const { logger, warnCalls } = createLoggerStub();
    const socketStub = createSocketStub();
    const receivedConfigs: UserFacingSocketConfig[] = [];

    await startBot({
      logger,
      runtimeConfig: createBotRuntimeConfig({ moduleDirectory: "/repo/apps/bot/src" }),
      resolveSocketVersion: async () => {
        throw new Error("version fetch failed");
      },
      loadAuthState: async () => ({
        state: createAuthenticationState(),
        saveCreds: async () => undefined,
        sessionPath: "/repo/data/bot/auth/default",
      }),
      createSocket: (config) => {
        receivedConfigs.push(config);
        return socketStub.socket;
      },
    });

    expect(receivedConfigs[0]?.version).toEqual([2, 3000, 1027934701]);
    expect(warnCalls).toContainEqual({
      payload: {
        error: expect.any(Error),
        fallbackVersion: [2, 3000, 1027934701],
        sessionKey: "default",
      },
      message: "bot socket version resolution failed; falling back to bundled version",
    });
  });
});
