import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browsers } from './baileys';
import { env } from '@cs/config';
import { normalizeSessionKey } from './sessionKey';

export const BOT_SESSION_KEY = "default" as const;
export const DEFAULT_BOT_SOCKET_VERSION = [2, 3000, 1027934701] as const;
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 30_000;
const DEFAULT_QR_TIMEOUT_MS = 60_000;
const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;

export interface BotRuntimeConfig {
  sessionKey: string;
  authDir: string;
  browser: [string, string, string];
  conversationHistoryWindowMessages: number;
  connectTimeoutMs: number;
  keepAliveIntervalMs: number;
  qrTimeoutMs: number;
  markOnlineOnConnect: boolean;
  syncFullHistory: boolean;
  reconnectBackoff: {
    initialDelayMs: number;
    maxDelayMs: number;
  };
}

interface CreateBotRuntimeConfigOverrides {
  sessionKey?: string;
  authDir?: string;
  moduleDirectory?: string;
  conversationHistoryWindowMessages?: number;
  connectTimeoutMs?: number;
  keepAliveIntervalMs?: number;
  qrTimeoutMs?: number;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

const assertPositiveInteger = (propertyName: string, value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid ${propertyName}: expected a positive integer, received ${String(value)}`,
    );
  }

  return value;
};

export const getBotRepoRoot = (
  moduleDirectory: string = fileURLToPath(new URL(".", import.meta.url)),
): string => resolve(moduleDirectory, "..", "..", "..");

const resolveAuthDir = (
  authDir: string,
  moduleDirectory?: string,
): string => {
  const normalizedAuthDir = authDir.trim();
  if (normalizedAuthDir.length === 0) {
    throw new Error("Invalid BotRuntimeConfig.authDir: expected a non-empty path");
  }

  return isAbsolute(normalizedAuthDir)
    ? normalizedAuthDir
    : resolve(getBotRepoRoot(moduleDirectory), normalizedAuthDir);
};

export const createBotRuntimeConfig = (
  overrides: CreateBotRuntimeConfigOverrides = {},
): BotRuntimeConfig => {
  const reconnectInitialDelayMs = assertPositiveInteger(
    "BotRuntimeConfig.reconnectBackoff.initialDelayMs",
    overrides.reconnectInitialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS,
  );
  const reconnectMaxDelayMs = assertPositiveInteger(
    "BotRuntimeConfig.reconnectBackoff.maxDelayMs",
    overrides.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
  );

  if (reconnectMaxDelayMs < reconnectInitialDelayMs) {
    throw new Error(
      "Invalid BotRuntimeConfig.reconnectBackoff.maxDelayMs: expected a value greater than or equal to the initial delay",
    );
  }

  const sessionKey = overrides.sessionKey === undefined
    ? BOT_SESSION_KEY
    : normalizeSessionKey(overrides.sessionKey, "BotRuntimeConfig.sessionKey");

  return {
    sessionKey,
    authDir: resolveAuthDir(overrides.authDir ?? env.BOT_AUTH_DIR, overrides.moduleDirectory),
    browser: Browsers.macOS("Chrome"),
    conversationHistoryWindowMessages: assertPositiveInteger(
      "BotRuntimeConfig.conversationHistoryWindowMessages",
      overrides.conversationHistoryWindowMessages ?? env.CONVERSATION_HISTORY_WINDOW_MESSAGES,
    ),
    connectTimeoutMs: assertPositiveInteger(
      "BotRuntimeConfig.connectTimeoutMs",
      overrides.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    ),
    keepAliveIntervalMs: assertPositiveInteger(
      "BotRuntimeConfig.keepAliveIntervalMs",
      overrides.keepAliveIntervalMs ?? DEFAULT_KEEP_ALIVE_INTERVAL_MS,
    ),
    qrTimeoutMs: assertPositiveInteger(
      "BotRuntimeConfig.qrTimeoutMs",
      overrides.qrTimeoutMs ?? DEFAULT_QR_TIMEOUT_MS,
    ),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    reconnectBackoff: {
      initialDelayMs: reconnectInitialDelayMs,
      maxDelayMs: reconnectMaxDelayMs,
    },
  };
};
