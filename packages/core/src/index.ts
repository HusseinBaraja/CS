import pino from "pino";
import type { DestinationStream, Logger, LoggerOptions } from "pino";
import { env } from "@cs/config";
import { formatError, type HealthStatus } from "@cs/shared";

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
  "*.ownerPhone"
] as const;

const baseLoggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [...redactPaths],
    censor: "[REDACTED]"
  }
};

export const createLogger = (
  options: LoggerOptions = {},
  destination?: DestinationStream
): Logger => {
  const finalOptions: LoggerOptions = {
    ...baseLoggerOptions,
    ...options
  };

  if (!destination && env.NODE_ENV !== "production") {
    return pino(
      {
        ...finalOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      },
      destination
    );
  }

  return pino(finalOptions, destination);
};

export const logger = createLogger();

export const logError = (
  log: Logger,
  error: unknown,
  message: string,
  context: Record<string, unknown> = {}
): void => {
  log.error(
    {
      err: formatError(error),
      context
    },
    message
  );
};

export const coreHealth = (): HealthStatus => ({
  service: "api",
  ok: true
});
