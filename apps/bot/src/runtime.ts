import {
  fetchLatestWaWebVersion,
  type BaileysEventMap,
  type UserFacingSocketConfig,
} from './baileys';
import makeWASocket from './baileys';
import {
  logEvent,
  logger as defaultLogger,
  serializeErrorForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import {
  getBotRuntimeReconnectDelayMs,
  type BotRuntimePairingState,
  type BotRuntimeSessionState,
} from '@cs/shared';
import { createLocalAuthState, type LocalAuthState } from './authState';
import { getDisconnectCode, shouldReconnectForDisconnectCode, toClosedLifecycleState } from './disconnect';
import {
  OutboundTransportUnavailableError,
  type OutboundTransport,
} from './outbound';
import {
  DEFAULT_BOT_SOCKET_VERSION,
  type BotRuntimeConfig,
  createBotRuntimeConfig,
} from './runtimeConfig';
import { createBaileysLogger } from './runtimeLogger';
import { createReadReceiptDeduper, type ReadReceiptMessage } from './readReceiptDedupe';

export type BotLifecycleState = BotRuntimeSessionState;

export interface BotSessionStatus {
  sessionKey: string;
  state: BotLifecycleState;
  attempt: number;
  hasQr: boolean;
  disconnectCode?: number;
  isNewLogin?: boolean;
}

export interface BotPairingStatus {
  sessionKey: string;
  state: BotRuntimePairingState;
  updatedAt: number;
  expiresAt?: number;
  qrText?: string;
}

export interface BotRuntimeHandle extends OutboundTransport {
  markRead(message: ReadReceiptMessage): Promise<void>;
  getStatus(): BotSessionStatus;
  stop(): Promise<void>;
}

export type BotLogger = StructuredLogger;

export interface BotConnectionUpdate {
  connection?: "open" | "connecting" | "close";
  lastDisconnect?: {
    error?: unknown;
    date?: Date;
  };
  isNewLogin?: boolean;
  qr?: string;
}

export type BotMessagesUpsert = BaileysEventMap["messages.upsert"];

interface BotEventEmitter {
  on(event: "connection.update", listener: (update: BotConnectionUpdate) => void): void;
  on(event: "creds.update", listener: (update: unknown) => void): void;
  on(event: "messages.upsert", listener: (update: BotMessagesUpsert) => void): void;
}

export interface BotSocket {
  ev: BotEventEmitter;
  end(error?: Error): void;
  readMessages(messages: Array<ReadReceiptMessage>): Promise<void>;
  sendMessage(recipientJid: string, message: unknown): Promise<unknown>;
  presenceSubscribe(recipientJid: string): Promise<void>;
  sendPresenceUpdate(state: "composing" | "paused", recipientJid: string): Promise<void>;
}

export interface BotProcess {
  exitCode?: number;
  once(
    event: "SIGINT" | "SIGTERM",
    handler: (...args: unknown[]) => void | Promise<void>,
  ): unknown;
}

export interface BotTimer {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(timeoutId: unknown): void;
}

export interface StartBotOptions {
  logger?: BotLogger;
  runtimeConfig?: BotRuntimeConfig;
  createSocket?: (config: UserFacingSocketConfig) => BotSocket;
  resolveSocketVersion?: () => Promise<UserFacingSocketConfig["version"]>;
  loadAuthState?: (options: {
    authDir: string;
    sessionKey: string;
  }) => Promise<LocalAuthState>;
  onStatusChange?: (status: BotSessionStatus) => void | Promise<void>;
  onPairingChange?: (pairing: BotPairingStatus) => void | Promise<void>;
  onMessagesUpsert?: (event: BotMessagesUpsert) => void | Promise<void>;
  botProcess?: BotProcess;
  registerProcessHandlers?: boolean;
  timer?: BotTimer;
  now?: () => number;
}

const defaultCreateSocket = (config: UserFacingSocketConfig): BotSocket =>
  makeWASocket(config) as unknown as BotSocket;

const defaultResolveSocketVersion = async (): Promise<UserFacingSocketConfig["version"]> => {
  const result = await fetchLatestWaWebVersion();
  return result.version;
};

const defaultTimer: BotTimer = {
  setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
  clearTimeout: (timeoutId) =>
    globalThis.clearTimeout(timeoutId as ReturnType<typeof globalThis.setTimeout>),
};

const statusEquals = (left: BotSessionStatus, right: BotSessionStatus): boolean =>
  left.sessionKey === right.sessionKey &&
  left.state === right.state &&
  left.attempt === right.attempt &&
  left.hasQr === right.hasQr &&
  left.disconnectCode === right.disconnectCode &&
  left.isNewLogin === right.isNewLogin;

const pairingEquals = (left: BotPairingStatus, right: BotPairingStatus): boolean =>
  left.sessionKey === right.sessionKey &&
  left.state === right.state &&
  left.updatedAt === right.updatedAt &&
  left.expiresAt === right.expiresAt &&
  left.qrText === right.qrText;

const getOpenSocketOrThrow = (
  socket: BotSocket | undefined,
  state: BotSessionStatus["state"],
  message: string,
): BotSocket => {
  if (!socket || state !== "open") {
    throw new OutboundTransportUnavailableError(message);
  }

  return socket;
};

const toStatusLogPayload = (status: BotSessionStatus) => ({
  sessionKey: status.sessionKey,
  state: status.state,
  attempt: status.attempt,
  hasQr: status.hasQr,
  ...(status.disconnectCode !== undefined ? { disconnectCode: status.disconnectCode } : {}),
  ...(status.isNewLogin !== undefined ? { isNewLogin: status.isNewLogin } : {}),
});

const toStateChangePayload = (status: BotSessionStatus) => ({
  event: "bot.session.state_changed",
  runtime: "bot",
  surface: "session",
  outcome: status.state,
  ...toStatusLogPayload(status),
});

export const startBot = async (
  options: StartBotOptions = {},
): Promise<BotRuntimeHandle> => {
  const runtimeConfig = options.runtimeConfig ?? createBotRuntimeConfig();
  const botLogger = withLogBindings(options.logger ?? defaultLogger, {
    runtime: "bot",
    sessionKey: runtimeConfig.sessionKey,
  });
  const sessionLogger = withLogBindings(botLogger, {
    surface: "session",
  });
  const runtimeLogger = withLogBindings(botLogger, {
    surface: "runtime",
  });
  const createSocket = options.createSocket ?? defaultCreateSocket;
  const resolveSocketVersion = options.resolveSocketVersion ?? defaultResolveSocketVersion;
  const loadAuthState = options.loadAuthState ?? ((authOptions) => createLocalAuthState(authOptions));
  const onStatusChange = options.onStatusChange;
  const onPairingChange = options.onPairingChange;
  const onMessagesUpsert = options.onMessagesUpsert;
  const botProcess = options.botProcess ?? process;
  const registerProcessHandlers = options.registerProcessHandlers ?? true;
  const timer = options.timer ?? defaultTimer;
  const now = options.now ?? Date.now;

  const initialStatus: BotSessionStatus = {
    sessionKey: runtimeConfig.sessionKey,
    state: "initializing",
    attempt: 0,
    hasQr: false,
  };
  let status: BotSessionStatus | undefined;
  let currentSocket: BotSocket | undefined;
  let reconnectTimeoutId: unknown;
  let qrExpiryTimeoutId: unknown;
  let reconnectAttempt = 0;
  let shuttingDown = false;
  let pairing: BotPairingStatus | undefined;
  const markReadDeduper = createReadReceiptDeduper();

  const setStatus = (nextStatus: BotSessionStatus): void => {
    if (status && statusEquals(status, nextStatus)) {
      return;
    }

    status = nextStatus;
    logEvent(
      sessionLogger,
      "info",
      toStateChangePayload(nextStatus),
      "bot session state changed",
    );
    if (onStatusChange) {
      void Promise.resolve()
        .then(() => onStatusChange(nextStatus))
        .catch((error) => {
          logEvent(
            runtimeLogger,
            "error",
            {
              event: "bot.runtime.status_callback_failed",
              runtime: "bot",
              surface: "runtime",
              outcome: "callback_failed",
              error: serializeErrorForLog(error),
              sessionKey: nextStatus.sessionKey,
            },
            "bot status change callback failed",
          );
        });
    }
  };

  const setPairing = (nextPairing: BotPairingStatus): void => {
    if (pairing && pairingEquals(pairing, nextPairing)) {
      return;
    }

    pairing = nextPairing;
    if (onPairingChange) {
      void Promise.resolve()
        .then(() => onPairingChange(nextPairing))
        .catch((error) => {
          logEvent(
            runtimeLogger,
            "error",
            {
              event: "bot.runtime.pairing_callback_failed",
              runtime: "bot",
              surface: "runtime",
              outcome: "callback_failed",
              error: serializeErrorForLog(error),
              sessionKey: nextPairing.sessionKey,
            },
            "bot pairing change callback failed",
          );
        });
    }
  };

  setStatus(initialStatus);

  const socketVersion = await resolveSocketVersion().catch((error) => {
    const warn = botLogger.warn?.bind(botLogger) ?? botLogger.info.bind(botLogger);
    warn(
      {
        event: "bot.runtime.version_fallback",
        runtime: "bot",
        surface: "runtime",
        outcome: "fallback",
        error: serializeErrorForLog(error),
        fallbackVersion: DEFAULT_BOT_SOCKET_VERSION,
        sessionKey: runtimeConfig.sessionKey,
      },
      "bot socket version resolution failed; falling back to bundled version",
    );

    return [
      DEFAULT_BOT_SOCKET_VERSION[0],
      DEFAULT_BOT_SOCKET_VERSION[1],
      DEFAULT_BOT_SOCKET_VERSION[2],
    ] as UserFacingSocketConfig["version"];
  });

  const authState = await loadAuthState({
    authDir: runtimeConfig.authDir,
    sessionKey: runtimeConfig.sessionKey,
  });

  const clearReconnectTimer = (): void => {
    if (reconnectTimeoutId === undefined) {
      return;
    }

    timer.clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = undefined;
  };

  const clearQrExpiryTimer = (): void => {
    if (qrExpiryTimeoutId === undefined) {
      return;
    }

    timer.clearTimeout(qrExpiryTimeoutId);
    qrExpiryTimeoutId = undefined;
  };

  const clearPairing = (): void => {
    clearQrExpiryTimer();
    if (!pairing || pairing.state === "none") {
      return;
    }

    setPairing({
      sessionKey: runtimeConfig.sessionKey,
      state: "none",
      updatedAt: now(),
    });
  };

  const schedulePairingExpiry = (qrText: string, expiresAt: number): void => {
    clearQrExpiryTimer();
    qrExpiryTimeoutId = timer.setTimeout(() => {
      qrExpiryTimeoutId = undefined;

      if (
        shuttingDown ||
        !pairing ||
        pairing.state !== "ready" ||
        pairing.qrText !== qrText
      ) {
        return;
      }

      setPairing({
        sessionKey: runtimeConfig.sessionKey,
        state: "expired",
        updatedAt: now(),
        expiresAt,
        qrText,
      });

      const currentStatus = status ?? initialStatus;
      if (currentStatus.state === "awaiting_pairing" && currentStatus.hasQr) {
        setStatus({
          ...currentStatus,
          hasQr: false,
        });
      }
    }, runtimeConfig.qrTimeoutMs);
  };

  const stop = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    clearReconnectTimer();
    clearPairing();

    if (currentSocket) {
      const socketToClose = currentSocket;
      currentSocket = undefined;
      socketToClose.end(undefined);
    }
  };

  const failRuntime = async (error: unknown, message: string): Promise<void> => {
    const currentStatus = status ?? initialStatus;
    setStatus({
      ...currentStatus,
      state: "failed",
      hasQr: false,
    });
    clearPairing();
    logEvent(
      runtimeLogger,
      "error",
      {
        event: "bot.runtime.terminal_failure",
        runtime: "bot",
        surface: "runtime",
        outcome: "failed",
        error: serializeErrorForLog(error),
        sessionKey: runtimeConfig.sessionKey,
      },
      message,
    );
    botProcess.exitCode = 1;
    await stop();
  };

  const scheduleReconnect = (
    disconnectCode: number | undefined,
    isNewLogin: boolean | undefined,
  ): void => {
    reconnectAttempt += 1;
    setStatus({
      sessionKey: runtimeConfig.sessionKey,
      state: "reconnecting",
      attempt: reconnectAttempt,
      disconnectCode,
      hasQr: false,
      ...(isNewLogin !== undefined ? { isNewLogin } : {}),
    });

    const delayMs = getBotRuntimeReconnectDelayMs(reconnectAttempt, runtimeConfig.reconnectBackoff);
    reconnectTimeoutId = timer.setTimeout(() => {
      reconnectTimeoutId = undefined;

      if (shuttingDown) {
        return;
      }

      try {
        connect();
      } catch (error) {
        logEvent(
          runtimeLogger,
          "error",
          {
            event: "bot.runtime.reconnect_attempt_failed",
            runtime: "bot",
            surface: "runtime",
            outcome: "retrying",
            error: serializeErrorForLog(error),
            sessionKey: runtimeConfig.sessionKey,
          },
          "bot reconnect attempt failed",
        );
        scheduleReconnect(disconnectCode, isNewLogin);
      }
    }, delayMs);
  };

  const connect = (): void => {
    if (shuttingDown) {
      return;
    }

    const socket = createSocket({
      auth: authState.state,
      browser: runtimeConfig.browser,
      connectTimeoutMs: runtimeConfig.connectTimeoutMs,
      keepAliveIntervalMs: runtimeConfig.keepAliveIntervalMs,
      logger: createBaileysLogger(botLogger),
      markOnlineOnConnect: runtimeConfig.markOnlineOnConnect,
      qrTimeout: runtimeConfig.qrTimeoutMs,
      syncFullHistory: runtimeConfig.syncFullHistory,
      version: socketVersion,
    } satisfies UserFacingSocketConfig);
    currentSocket = socket;

    socket.ev.on("creds.update", () => {
      if (shuttingDown || currentSocket !== socket) {
        return;
      }

      void authState.saveCreds().catch((error) =>
        failRuntime(error, "bot auth state persistence failed")
      );
    });

    socket.ev.on("messages.upsert", (event) => {
      if (shuttingDown || currentSocket !== socket || !onMessagesUpsert) {
        return;
      }

      void (async () => {
        try {
          await onMessagesUpsert(event);
        } catch (error) {
          logEvent(
            runtimeLogger,
            "error",
            {
              event: "bot.runtime.inbound_callback_failed",
              runtime: "bot",
              surface: "runtime",
              outcome: "callback_failed",
              error: serializeErrorForLog(error),
              sessionKey: runtimeConfig.sessionKey,
            },
            "bot inbound message callback failed",
          );
        }
      })();
    });

    socket.ev.on("connection.update", (update) => {
      if (shuttingDown || currentSocket !== socket) {
        return;
      }

      if (update.qr) {
        if (pairing?.state === "ready" && pairing.qrText === update.qr) {
          return;
        }

        const expiresAt = now() + runtimeConfig.qrTimeoutMs;
        setPairing({
          sessionKey: runtimeConfig.sessionKey,
          state: "ready",
          qrText: update.qr,
          updatedAt: now(),
          expiresAt,
        });
        schedulePairingExpiry(update.qr, expiresAt);
        setStatus({
          sessionKey: runtimeConfig.sessionKey,
          state: "awaiting_pairing",
          attempt: reconnectAttempt,
          disconnectCode: undefined,
          hasQr: true,
          ...(update.isNewLogin !== undefined ? { isNewLogin: update.isNewLogin } : {}),
        });
        return;
      }

      if (update.connection === "connecting") {
        if (pairing?.state === "expired") {
          clearPairing();
        }
        setStatus({
          sessionKey: runtimeConfig.sessionKey,
          state: "connecting",
          attempt: reconnectAttempt,
          disconnectCode: undefined,
          hasQr: false,
          ...(update.isNewLogin !== undefined ? { isNewLogin: update.isNewLogin } : {}),
        });
        return;
      }

      if (update.connection === "open") {
        clearReconnectTimer();
        reconnectAttempt = 0;
        clearPairing();
        setStatus({
          sessionKey: runtimeConfig.sessionKey,
          state: "open",
          attempt: 0,
          disconnectCode: undefined,
          hasQr: false,
          ...(update.isNewLogin !== undefined ? { isNewLogin: update.isNewLogin } : {}),
        });
        return;
      }

      if ((status ?? initialStatus).state === "awaiting_pairing" && update.isNewLogin === true) {
        clearPairing();
        setStatus({
          sessionKey: runtimeConfig.sessionKey,
          state: "connecting",
          attempt: reconnectAttempt,
          disconnectCode: undefined,
          hasQr: false,
          isNewLogin: true,
        });
        return;
      }

      if (update.connection !== "close") {
        return;
      }

      currentSocket = undefined;
      clearReconnectTimer();
      clearPairing();

      const disconnectCode = getDisconnectCode(update.lastDisconnect?.error);
      if (shouldReconnectForDisconnectCode(disconnectCode, reconnectAttempt + 1)) {
        scheduleReconnect(disconnectCode, update.isNewLogin);
        return;
      }

      setStatus({
        sessionKey: runtimeConfig.sessionKey,
        state: toClosedLifecycleState(disconnectCode),
        attempt: reconnectAttempt,
        disconnectCode,
        hasQr: false,
        ...(update.isNewLogin !== undefined ? { isNewLogin: update.isNewLogin } : {}),
      });
    });
  };

  connect();

  if (registerProcessHandlers) {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      botProcess.once(signal, () => stop());
    }
  }

  return {
    getStatus: () => status ?? initialStatus,
    async presenceSubscribe(recipientJid) {
      const activeSocket = getOpenSocketOrThrow(
        currentSocket,
        (status ?? initialStatus).state,
        "Bot socket is unavailable for presence subscription",
      );
      await activeSocket.presenceSubscribe(recipientJid);
    },
    async sendMessage(recipientJid, message) {
      const activeSocket = getOpenSocketOrThrow(
        currentSocket,
        (status ?? initialStatus).state,
        "Bot socket is unavailable for outbound sends",
      );
      return activeSocket.sendMessage(recipientJid, message);
    },
    async markRead(message) {
      await markReadDeduper(message, async () => {
        const activeSocket = getOpenSocketOrThrow(
          currentSocket,
          (status ?? initialStatus).state,
          "Bot socket is unavailable for read receipts",
        );
        await activeSocket.readMessages([message]);
      });
    },
    async sendPresenceUpdate(state, recipientJid) {
      const activeSocket = getOpenSocketOrThrow(
        currentSocket,
        (status ?? initialStatus).state,
        "Bot socket is unavailable for presence updates",
      );
      await activeSocket.sendPresenceUpdate(state, recipientJid);
    },
    stop,
  };
};
