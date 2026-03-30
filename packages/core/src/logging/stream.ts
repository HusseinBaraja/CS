import { createWriteStream } from 'node:fs';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { DestinationStream } from 'pino';
import { Writable } from 'node:stream';

export interface LoggerRuntimeConfig {
  NODE_ENV: "development" | "test" | "production";
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  LOG_DIR: string;
  LOG_RETENTION_DAYS: number;
}

export interface DailyRotatingFileStreamOptions {
  now?: () => Date;
  createStream?: (path: string) => Writable;
  fallbackStream?: Writable;
  onStreamError?: (error: Error) => void;
  scheduleTask?: (task: () => void) => void;
}

const LOG_FILE_PREFIX = "cs";
const LOG_FILE_PATTERN = new RegExp(`^${LOG_FILE_PREFIX}-(\\d{4}-\\d{2}-\\d{2})\\.log$`);

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
  private rotationEnabled = true;
  private stream: Writable | null = null;
  private pendingWrites: Array<{
    callback: (error?: Error | null) => void;
    chunk: Buffer | string;
    encoding: BufferEncoding;
  }> = [];
  private rotationPending = false;
  private rotationScheduled = false;
  private rotationInProgress = false;
  private cleanupScheduled = false;
  private cleanupInProgress = false;
  private isShuttingDown = false;
  private readonly now: () => Date;
  private readonly createStream: (path: string) => Writable;
  private readonly fallbackStream: Writable;
  private readonly onStreamError: (error: Error) => void;
  private readonly scheduleTask: (task: () => void) => void;

  constructor(
    private readonly config: Pick<LoggerRuntimeConfig, "LOG_DIR" | "LOG_RETENTION_DAYS">,
    options: DailyRotatingFileStreamOptions = {},
  ) {
    super();
    this.now = options.now ?? (() => new Date());
    this.createStream = options.createStream ?? ((path) => createWriteStream(path, { flags: "a" }));
    this.fallbackStream = options.fallbackStream ?? process.stderr;
    this.scheduleTask = options.scheduleTask ?? ((task) => setImmediate(task));
    this.onStreamError =
      options.onStreamError ??
      ((error) => {
        try {
          process.stderr.write(`[logger] Failed to write log file: ${error.message}\n`);
        } catch {
          // Ignore stderr write failures to avoid affecting app flow.
        }
      });
    this.triggerRotationIfNeeded();
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.triggerRotationIfNeeded();

    if (this.rotationPending || this.rotationInProgress) {
      this.pendingWrites.push({ chunk, encoding, callback });
      return;
    }

    this.writeResolvedDestination(chunk, encoding, callback);
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.isShuttingDown = true;

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
    this.isShuttingDown = true;

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

  private triggerRotationIfNeeded(): void {
    if (
      this.isShuttingDown ||
      !this.rotationEnabled ||
      this.rotationScheduled ||
      this.rotationInProgress ||
      !this.needsRotation()
    ) {
      return;
    }

    this.rotationPending = true;
    this.rotationScheduled = true;
    this.scheduleTask(() => {
      this.rotationScheduled = false;

      if (this.isShuttingDown || this.rotationInProgress || !this.needsRotation()) {
        this.rotationPending = false;
        this.flushPendingWrites();
        return;
      }

      this.rotationInProgress = true;
      void this.rotateSafely().finally(() => {
        this.rotationInProgress = false;
        this.rotationPending = false;
        this.flushPendingWrites();
      });
    });
  }

  private needsRotation(): boolean {
    return !this.stream || formatLogDate(this.now()) !== this.currentDate;
  }

  private async rotateSafely(): Promise<void> {
    try {
      await this.rotate();
    } catch (error) {
      this.markRotationFailure(error);
    }
  }

  private async rotate(): Promise<void> {
    await mkdir(this.config.LOG_DIR, { recursive: true });

    if (this.isShuttingDown) {
      return;
    }

    const now = this.now();
    const currentDate = formatLogDate(now);
    const nextPath = getLogFilePath(this.config.LOG_DIR, now);

    if (this.currentDate === currentDate && this.stream) {
      return;
    }

    const previousStream = this.stream;
    const previousDate = this.currentDate;
    let nextStream: Writable | null = null;

    try {
      nextStream = this.createStream(nextPath);

      if (this.isShuttingDown) {
        nextStream.destroy();
        return;
      }

      nextStream.on("error", this.handleStreamError);
      this.stream = nextStream;
      this.currentDate = currentDate;
      this.rotationEnabled = true;
      this.triggerCleanup();

      if (previousStream) {
        previousStream.off("error", this.handleStreamError);
        previousStream.once("error", (streamError) => {
          this.onStreamError(this.toError(streamError));
        });
        previousStream.end();
      }
    } catch (error) {
      nextStream?.off("error", this.handleStreamError);
      nextStream?.destroy();
      this.stream = previousStream;
      this.currentDate = previousDate;
      throw error;
    }
  }

  private handleStreamError = (error: unknown): void => {
    const activeStream = this.stream;
    if (!activeStream) {
      return;
    }

    this.onStreamError(this.toError(error));
    this.rotationEnabled = false;
    activeStream.off("error", this.handleStreamError);
    activeStream.destroy();
    this.stream = null;
  };

  private triggerCleanup(): void {
    if (this.isShuttingDown || this.cleanupScheduled || this.cleanupInProgress) {
      return;
    }

    this.cleanupScheduled = true;
    this.scheduleTask(() => {
      this.cleanupScheduled = false;

      if (this.isShuttingDown || this.cleanupInProgress) {
        return;
      }

      this.cleanupInProgress = true;
      void this.cleanupExpiredLogs()
        .catch((error) => {
          this.onStreamError(this.toError(error));
        })
        .finally(() => {
          this.cleanupInProgress = false;
        });
    });
  }

  private markRotationFailure(error: unknown): void {
    this.onStreamError(this.toError(error));
    this.rotationEnabled = false;

    if (!this.stream) {
      this.currentDate = "";
    }
  }

  private flushPendingWrites(): void {
    if (this.rotationPending || this.rotationInProgress || this.pendingWrites.length === 0) {
      return;
    }

    const writes = this.pendingWrites;
    this.pendingWrites = [];

    const flushNext = (): void => {
      const nextWrite = writes.shift();
      if (!nextWrite) {
        return;
      }

      this.writeResolvedDestination(nextWrite.chunk, nextWrite.encoding, (error) => {
        nextWrite.callback(error);
        flushNext();
      });
    };

    flushNext();
  }

  private writeResolvedDestination(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const activeStream = this.stream;
    if (!activeStream) {
      this.writeFallback(chunk, encoding, callback);
      return;
    }

    this.writeToActiveStream(activeStream, chunk, encoding, callback);
  }

  private writeToActiveStream(
    activeStream: Writable,
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    let completed = false;
    const completeWrite = () => {
      if (completed) {
        return;
      }

      completed = true;
      activeStream.off("error", onWriteError);
      callback();
    };

    const failWrite = (error: unknown) => {
      if (completed) {
        return;
      }

      completed = true;
      activeStream.off("error", onWriteError);
      this.handleStreamError(error);
      this.writeFallback(chunk, encoding, callback);
    };

    const onWriteError = (error: Error) => {
      failWrite(error);
    };

    activeStream.once("error", onWriteError);

    try {
      if (typeof chunk === "string") {
        activeStream.write(chunk, encoding, (error) => {
          if (error) {
            failWrite(error);
            return;
          }

          completeWrite();
        });
        return;
      }

      activeStream.write(chunk, (error) => {
        if (error) {
          failWrite(error);
          return;
        }

        completeWrite();
      });
    } catch (error) {
      failWrite(error);
    }
  }

  private writeFallback(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      if (typeof chunk === "string") {
        this.fallbackStream.write(chunk, encoding, (error) => {
          if (error) {
            this.onStreamError(this.toError(error));
          }

          callback();
        });
        return;
      }

      this.fallbackStream.write(chunk, (error) => {
        if (error) {
          this.onStreamError(this.toError(error));
        }

        callback();
      });
    } catch (error) {
      this.onStreamError(this.toError(error));
      callback();
    }
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }

  private async cleanupExpiredLogs(): Promise<void> {
    const now = this.now();
    const retentionDays = Number.isFinite(this.config.LOG_RETENTION_DAYS)
      ? Math.max(1, Math.floor(this.config.LOG_RETENTION_DAYS))
      : 1;
    const oldestAllowed = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (retentionDays - 1),
    ).getTime();

    for (const entry of await readdir(this.config.LOG_DIR)) {
      const fileDate = parseLogDate(entry);
      if (!fileDate) {
        continue;
      }

      if (toStartOfDay(fileDate).getTime() < oldestAllowed) {
        try {
          await unlink(join(this.config.LOG_DIR, entry));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            continue;
          }

          this.onStreamError(
            new Error(`Failed to delete expired log file "${entry}": ${this.toError(error).message}`),
          );
        }
      }
    }
  }
}

export const createProductionLogDestination = (
  config: Pick<LoggerRuntimeConfig, "LOG_DIR" | "LOG_RETENTION_DAYS">,
  options: DailyRotatingFileStreamOptions = {},
): DestinationStream & Writable =>
  new DailyRotatingFileStream(config, options);
