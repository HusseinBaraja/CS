import { createWriteStream, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DestinationStream, Logger, LoggerOptions } from 'pino';
import pino from 'pino';
import { Writable } from 'node:stream';
import { env } from '@cs/config';
import { formatError, type HealthStatus } from '@cs/shared';

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
  createStream?: (path: string) => Writable;
  onStreamError?: (error: Error) => void;
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
  private stream: Writable | null = null;
  private readonly now: () => Date;
  private readonly createStream: (path: string) => Writable;
  private readonly onStreamError: (error: Error) => void;

  constructor(
    private readonly config: Pick<LoggerRuntimeConfig, "LOG_DIR" | "LOG_RETENTION_DAYS">,
    options: DailyRotatingFileStreamOptions = {}
  ) {
    super();
    this.now = options.now ?? (() => new Date());
    this.createStream = options.createStream ?? ((path) => createWriteStream(path, { flags: "a" }));
    this.onStreamError =
      options.onStreamError ??
      ((error) => {
        try {
          process.stderr.write(`[logger] Failed to write log file: ${error.message}\n`);
        } catch {
          // Ignore stderr write failures to avoid affecting app flow.
        }
      });
    this.rotate();
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      this.rotateIfNeeded();
    } catch (error) {
      this.onStreamError(this.toError(error));
      callback();
      return;
    }

    const activeStream = this.stream;
    if (!activeStream) {
      callback();
      return;
    }

    let completed = false;
    const completeWrite = () => {
      if (completed) {
        return;
      }

      completed = true;
      activeStream.off("error", onWriteError);
      callback();
    };

    const onWriteError = (error: Error) => {
      this.handleStreamError(error);
      completeWrite();
    };

    activeStream.once("error", onWriteError);

    try {
      activeStream.write(chunk, encoding, (error) => {
        if (error) {
          this.handleStreamError(error);
        }

        completeWrite();
      });
    } catch (error) {
      this.handleStreamError(error);
      completeWrite();
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (!this.stream) {
      callback();
      return;
    }

    const closingStream = this.stream;
    closingStream.off("error", this.handleStreamError);
    closingStream.once("error", (streamError) => {
      this.onStreamError(this.toError(streamError));
    });
    closingStream.end(() => callback());
    this.stream = null;
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (this.stream) {
      const destroyingStream = this.stream;
      destroyingStream.off("error", this.handleStreamError);
      destroyingStream.once("error", (streamError) => {
        this.onStreamError(this.toError(streamError));
      });
      destroyingStream.destroy();
      this.stream = null;
    }

    callback(error);
  }

  private rotateIfNeeded(): void {
    if (!this.stream || formatLogDate(this.now()) !== this.currentDate) {
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

    if (this.stream) {
      const closingStream = this.stream;
      closingStream.off("error", this.handleStreamError);
      closingStream.once("error", (streamError) => {
        this.onStreamError(this.toError(streamError));
      });
      closingStream.end();
    }

    this.currentDate = currentDate;
    const nextStream = this.createStream(nextPath);
    nextStream.on("error", this.handleStreamError);
    this.stream = nextStream;
  }

  private handleStreamError = (error: unknown): void => {
    const activeStream = this.stream;
    if (!activeStream) {
      return;
    }

    this.onStreamError(this.toError(error));
    activeStream.off("error", this.handleStreamError);
    activeStream.destroy();
    this.stream = null;
  };

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
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
  new DailyRotatingFileStream(config, options);

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
