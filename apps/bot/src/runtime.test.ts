import { describe, expect, test } from 'bun:test';
import type { AuthenticationState, UserFacingSocketConfig } from '@whiskeysockets/baileys';
import { type BotConnectionUpdate, type BotSocket, startBot } from './runtime';
import { createBotRuntimeConfig } from './runtimeConfig';

type RegisteredHandler = () => void | Promise<void>;

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

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
    },
    infoCalls,
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
  const endCalls: unknown[] = [];

  const socket: BotSocket = {
    ev: {
      on: (event, handler) => {
        if (event === "connection.update") {
          connectionHandlers.push(handler as (update: BotConnectionUpdate) => void);
          return;
        }

        credsHandlers.push(handler as (update: unknown) => void);
      },
    },
    end: (error) => {
      endCalls.push(error);
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
    endCalls,
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

    const handle = await startBot({
      logger,
      runtimeConfig,
      botProcess: process,
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
    expect(Array.from(handlers.keys()).sort()).toEqual(["SIGINT", "SIGTERM", "beforeExit"]);
    expect(receivedConfigs).toHaveLength(1);
    expect(receivedConfigs[0]?.markOnlineOnConnect).toBe(false);
    expect(receivedConfigs[0]?.syncFullHistory).toBe(false);
    expect(receivedConfigs[0]?.browser).toEqual(runtimeConfig.browser);
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
    await handlers.get("beforeExit")?.();

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
});
