import type { BaileysEventMap, UserFacingSocketConfig } from '@whiskeysockets/baileys';
import makeWASocket from '@whiskeysockets/baileys';
import { logger as defaultLogger } from '@cs/core';
import type { BotRuntimePairingState, BotRuntimeSessionState } from '@cs/shared';
import { createLocalAuthState, type LocalAuthState } from './authState';
import { getDisconnectCode, shouldReconnectForDisconnectCode, toClosedLifecycleState } from './disconnect';
import {
  OutboundTransportUnavailableError,
  type OutboundTransport,
} from './outbound';
import { type BotRuntimeConfig, createBotRuntimeConfig } from './runtimeConfig';

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
  getStatus(): BotSessionStatus;
  stop(): Promise<void>;
}

export interface BotLogger {
  info(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
  warn?(payload: unknown, message: string): void;
  debug?(payload: unknown, message: string): void;
  child?(bindings: Record<string, unknown>): BotLogger;
}

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
  sendMessage(recipientJid: string, message: unknown): Promise<unknown>;
  presenceSubscribe(recipientJid: string): Promise<void>;
  sendPresenceUpdate(state: "composing" | "paused", recipientJid: string): Promise<void>;
}

export interface BotProcess {
  exitCode?: number;
  once(
    event: "SIGINT" | "SIGTERM" | "beforeExit",
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

const createBaileysLogger = (botLogger: BotLogger) => {
  const activeLogger = typeof botLogger.child === "function"
    ? botLogger.child({ runtime: "baileys" })
    : botLogger;
  const info = activeLogger.info.bind(activeLogger);
  const error = activeLogger.error.bind(activeLogger);
  const warn = activeLogger.warn?.bind(activeLogger) ?? info;
  const debug = activeLogger.debug?.bind(activeLogger) ?? info;

  return {
    level: "info",
    child: () => createBaileysLogger(activeLogger),
    trace: (payload: unknown, message?: string) => debug(payload, message ?? "baileys trace"),
    debug: (payload: unknown, message?: string) => debug(payload, message ?? "baileys debug"),
    info: (payload: unknown, message?: string) => info(payload, message ?? "baileys info"),
    warn: (payload: unknown, message?: string) => warn(payload, message ?? "baileys warning"),
    error: (payload: unknown, message?: string) => error(payload, message ?? "baileys error"),
  };
};

const defaultCreateSocket = (config: UserFacingSocketConfig): BotSocket =>
  makeWASocket(config) as unknown as BotSocket;

const defaultTimer: BotTimer = {
  setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
  clearTimeout: (timeoutId) =>
    globalThis.clearTimeout(timeoutId as ReturnType<typeof globalThis.setTimeout>),
};

const getReconnectDelayMs = (
  attempt: number,
  runtimeConfig: Pick<BotRuntimeConfig, "reconnectBackoff">,
): number =>
  Math.min(
    runtimeConfig.reconnectBackoff.initialDelayMs * 2 ** Math.max(0, attempt - 1),
    runtimeConfig.reconnectBackoff.maxDelayMs,
  );

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

const toStatusLogPayload = (status: BotSessionStatus) => ({
  sessionKey: status.sessionKey,
  state: status.state,
  attempt: status.attempt,
  hasQr: status.hasQr,
  ...(status.disconnectCode !== undefined ? { disconnectCode: status.disconnectCode } : {}),
  ...(status.isNewLogin !== undefined ? { isNewLogin: status.isNewLogin } : {}),
});

export const startBot = async (
  options: StartBotOptions = {},
): Promise<BotRuntimeHandle> => {
  const botLogger = options.logger ?? defaultLogger;
  const runtimeConfig = options.runtimeConfig ?? createBotRuntimeConfig();
  const createSocket = options.createSocket ?? defaultCreateSocket;
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

  const setStatus = (nextStatus: BotSessionStatus): void => {
    if (status && statusEquals(status, nextStatus)) {
      return;
    }

    status = nextStatus;
    botLogger.info(toStatusLogPayload(nextStatus), "bot session state changed");
    if (onStatusChange) {
      void Promise.resolve()
        .then(() => onStatusChange(nextStatus))
        .catch((error) => {
          botLogger.error(
            {
              error,
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
          botLogger.error(
            {
              error,
              sessionKey: nextPairing.sessionKey,
            },
            "bot pairing change callback failed",
          );
        });
    }
  };

  setStatus(initialStatus);

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
    botLogger.error(
      {
        sessionKey: runtimeConfig.sessionKey,
        error,
      },
      message,
    );
    botProcess.exitCode = 1;
    await stop();
  };

  const connect = (): void => {
    if (shuttingDown) {
      return;
    }

    currentSocket = createSocket({
      auth: authState.state,
      browser: runtimeConfig.browser,
      connectTimeoutMs: runtimeConfig.connectTimeoutMs,
      keepAliveIntervalMs: runtimeConfig.keepAliveIntervalMs,
      logger: createBaileysLogger(botLogger),
      markOnlineOnConnect: runtimeConfig.markOnlineOnConnect,
      qrTimeout: runtimeConfig.qrTimeoutMs,
      syncFullHistory: runtimeConfig.syncFullHistory,
    } satisfies UserFacingSocketConfig);

    currentSocket.ev.on("creds.update", () => {
      void authState.saveCreds().catch((error) =>
        failRuntime(error, "bot auth state persistence failed")
      );
    });

    currentSocket.ev.on("messages.upsert", (event) => {
      if (shuttingDown || !onMessagesUpsert) {
        return;
      }

      void (async () => {
        try {
          await onMessagesUpsert(event);
        } catch (error) {
          botLogger.error(
            {
              error,
              sessionKey: runtimeConfig.sessionKey,
            },
            "bot inbound message callback failed",
          );
        }
      })();
    });

    currentSocket.ev.on("connection.update", (update) => {
      if (shuttingDown) {
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
      if (shouldReconnectForDisconnectCode(disconnectCode)) {
        reconnectAttempt += 1;
        setStatus({
          sessionKey: runtimeConfig.sessionKey,
          state: "reconnecting",
          attempt: reconnectAttempt,
          disconnectCode,
          hasQr: false,
          ...(update.isNewLogin !== undefined ? { isNewLogin: update.isNewLogin } : {}),
        });

        const delayMs = getReconnectDelayMs(reconnectAttempt, runtimeConfig);
        reconnectTimeoutId = timer.setTimeout(() => {
          reconnectTimeoutId = undefined;
          connect();
        }, delayMs);
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
    for (const signal of ["SIGINT", "SIGTERM", "beforeExit"] as const) {
      botProcess.once(signal, () => stop());
    }
  }

  return {
    getStatus: () => status ?? initialStatus,
    async presenceSubscribe(recipientJid) {
      const activeSocket = currentSocket;
      if (!activeSocket || (status ?? initialStatus).state !== "open") {
        throw new OutboundTransportUnavailableError(
          "Bot socket is unavailable for presence subscription",
        );
      }

      await activeSocket.presenceSubscribe(recipientJid);
    },
    async sendMessage(recipientJid, message) {
      const activeSocket = currentSocket;
      if (!activeSocket || (status ?? initialStatus).state !== "open") {
        throw new OutboundTransportUnavailableError(
          "Bot socket is unavailable for outbound sends",
        );
      }

      return activeSocket.sendMessage(recipientJid, message);
    },
    async sendPresenceUpdate(state, recipientJid) {
      const activeSocket = currentSocket;
      if (!activeSocket || (status ?? initialStatus).state !== "open") {
        throw new OutboundTransportUnavailableError(
          "Bot socket is unavailable for presence updates",
        );
      }

      await activeSocket.sendPresenceUpdate(state, recipientJid);
    },
    stop,
  };
};
