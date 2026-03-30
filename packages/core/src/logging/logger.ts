import type { DestinationStream, Logger, LoggerOptions } from 'pino';
import pino from 'pino';
import { env } from '@cs/config';
import { serializeErrorForLog } from './helpers';
import { createProductionLogDestination, type LoggerRuntimeConfig } from './stream';
import type { StructuredLogger } from './types';

const redactPaths = [
  "password",
  "token",
  "authorization",
  "apiKey",
  "secret",
  "phone",
  "phoneNumber",
  "ownerPhone",
  "*.password",
  "*.token",
  "*.authorization",
  "*.apiKey",
  "*.secret",
  "*.phone",
  "*.phoneNumber",
  "*.ownerPhone",
  "*.*.password",
  "*.*.token",
  "*.*.authorization",
  "*.*.apiKey",
  "*.*.secret",
  "*.*.phone",
  "*.*.phoneNumber",
  "*.*.ownerPhone",
  "error.context.password",
  "error.context.token",
  "error.context.authorization",
  "error.context.apiKey",
  "error.context.secret",
  "error.context.phone",
  "error.context.phoneNumber",
  "error.context.ownerPhone",
  "error.cause.context.password",
  "error.cause.context.token",
  "error.cause.context.authorization",
  "error.cause.context.apiKey",
  "error.cause.context.secret",
  "error.cause.context.phone",
  "error.cause.context.phoneNumber",
  "error.cause.context.ownerPhone",
] as const;

const baseLoggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [...redactPaths],
    censor: "[REDACTED]",
  },
};

export const createLoggerRuntimeConfig = (
  config: Partial<LoggerRuntimeConfig> = {},
): LoggerRuntimeConfig => ({
  NODE_ENV: config.NODE_ENV ?? env.NODE_ENV,
  LOG_LEVEL: config.LOG_LEVEL ?? env.LOG_LEVEL,
  LOG_DIR: config.LOG_DIR ?? env.LOG_DIR,
  LOG_RETENTION_DAYS: config.LOG_RETENTION_DAYS ?? env.LOG_RETENTION_DAYS,
});

const createPrettyStream = () =>
  pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
    },
  });

export const createLogger = (
  options: LoggerOptions = {},
  destination?: DestinationStream,
  runtimeConfig: LoggerRuntimeConfig = createLoggerRuntimeConfig(),
): Logger => {
  const finalOptions: LoggerOptions = {
    ...baseLoggerOptions,
    level: runtimeConfig.LOG_LEVEL,
    ...options,
  };

  const structuredDestination =
    destination ??
    createProductionLogDestination({
      LOG_DIR: runtimeConfig.LOG_DIR,
      LOG_RETENTION_DAYS: runtimeConfig.LOG_RETENTION_DAYS,
    });

  if (!destination && runtimeConfig.NODE_ENV !== "production") {
    return pino(finalOptions, pino.multistream([
      { stream: structuredDestination },
      { stream: createPrettyStream() },
    ]));
  }

  return pino(finalOptions, structuredDestination);
};

export const logger = createLogger();

export const logError = (
  log: StructuredLogger,
  error: unknown,
  message: string,
  context: Record<string, unknown> = {},
): void => {
  log.error(
    {
      event: "core.log.error",
      runtime: "core",
      surface: "logger",
      outcome: "error",
      error: serializeErrorForLog(error),
      ...(Object.keys(context).length > 0 ? { context } : {}),
    },
    message,
  );
};
