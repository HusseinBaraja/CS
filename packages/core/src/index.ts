import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  unlinkSync,
  type WriteStream
} from "node:fs";
import { join } from "node:path";
import pino from "pino";
import type { DestinationStream, Logger, LoggerOptions } from "pino";
import { Writable } from "node:stream";
import { env } from "@cs/config";
import { formatError, type HealthStatus } from "@cs/shared";

const LOG_FILE_PREFIX = "cs";
const LOG_FILE_PATTERN = new RegExp(`^${LOG_FILE_PREFIX}-(\\d{4}-\\d{2}-\\d{2})\\.log$`);

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

export interface LoggerRuntimeConfig {
  NODE_ENV: "development" | "test" | "production";
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  LOG_DIR: string;
  LOG_RETENTION_DAYS: number;
}

interface DailyRotatingFileStreamOptions {
  now?: () => Date;
}

const formatLogDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const toStartOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseLogDate = (filename: string): Date | null => {
  const match = LOG_FILE_PATTERN.exec(filename);

  if (!match) {
    return null;
  }

  const [year, month, day] = match[1].split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getLogFilePath = (logDir: string, date: Date): string =>
  join(logDir, `${LOG_FILE_PREFIX}-${formatLogDate(date)}.log`);

class DailyRotatingFileStream extends Writable {
  private currentDate = "";
  private stream: WriteStream | null = null;

  constructor(
    private readonly config: Pick<LoggerRuntimeConfig, "LOG_DIR" | "LOG_RETENTION_DAYS">,
    private readonly now: () => Date = () => new Date()
  ) {
    super();
    this.rotate();
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      this.rotateIfNeeded();
      const activeStream = this.stream;

      if (!activeStream) {
        callback(new Error("Logger stream is not initialized"));
        return;
      }

      const canContinue = activeStream.write(chunk, encoding);
      if (canContinue) {
        callback();
        return;
      }

      activeStream.once("drain", () => callback());
    } catch (error) {
      callback(error as Error);
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (!this.stream) {
      callback();
      return;
    }

    this.stream.end(() => callback());
    this.stream = null;
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.stream?.destroy();
    this.stream = null;
    callback(error);
  }

  private rotateIfNeeded(): void {
    if (formatLogDate(this.now()) !== this.currentDate) {
      this.rotate();
    }
  }

  private rotate(): void {
    mkdirSync(this.config.LOG_DIR, { recursive: true });
    this.cleanupExpiredLogs();

    const currentDate = formatLogDate(this.now());
    const nextPath = getLogFilePath(this.config.LOG_DIR, this.now());

    if (this.currentDate === currentDate && this.stream) {
      return;
    }

    this.stream?.end();
    this.currentDate = currentDate;
    this.stream = createWriteStream(nextPath, { flags: "a" });
  }

  private cleanupExpiredLogs(): void {
    const retentionStart = toStartOfDay(this.now()).getTime();
    const retentionWindow = (this.config.LOG_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000;
    const oldestAllowed = retentionStart - retentionWindow;

    for (const entry of readdirSync(this.config.LOG_DIR)) {
      const fileDate = parseLogDate(entry);
      if (!fileDate) {
        continue;
      }

      if (toStartOfDay(fileDate).getTime() < oldestAllowed) {
        unlinkSync(join(this.config.LOG_DIR, entry));
      }
    }
  }
}

export const createLoggerRuntimeConfig = (
  config: Partial<LoggerRuntimeConfig> = {}
): LoggerRuntimeConfig => ({
  NODE_ENV: config.NODE_ENV ?? env.NODE_ENV,
  LOG_LEVEL: config.LOG_LEVEL ?? env.LOG_LEVEL,
  LOG_DIR: config.LOG_DIR ?? env.LOG_DIR,
  LOG_RETENTION_DAYS: config.LOG_RETENTION_DAYS ?? env.LOG_RETENTION_DAYS
});

export const createProductionLogDestination = (
  config: Pick<LoggerRuntimeConfig, "LOG_DIR" | "LOG_RETENTION_DAYS">,
  options: DailyRotatingFileStreamOptions = {}
): DestinationStream =>
  new DailyRotatingFileStream(config, options.now);

export const createLogger = (
  options: LoggerOptions = {},
  destination?: DestinationStream,
  runtimeConfig: LoggerRuntimeConfig = createLoggerRuntimeConfig()
): Logger => {
  const finalOptions: LoggerOptions = {
    ...baseLoggerOptions,
    level: runtimeConfig.LOG_LEVEL,
    ...options
  };

  if (!destination && runtimeConfig.NODE_ENV !== "production") {
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

  const finalDestination =
    destination ??
    createProductionLogDestination({
      LOG_DIR: runtimeConfig.LOG_DIR,
      LOG_RETENTION_DAYS: runtimeConfig.LOG_RETENTION_DAYS
    });

  return pino(finalOptions, finalDestination);
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
