import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ValidationError } from '@cs/shared';
import { createLogger, createLoggerRuntimeConfig, createProductionLogDestination, logError } from './index';

const parseLogLines = (buffer: string): Record<string, unknown>[] =>
  buffer
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const waitForAsyncWork = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe("logger", () => {
  test("outputs only messages at configured level", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const testLogger = createLogger({ level: "warn" }, stream);
    testLogger.info("hidden-info");
    testLogger.warn("visible-warn");

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.msg).toBe("visible-warn");
  });

  test("redacts sensitive fields", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const testLogger = createLogger({ level: "info" }, stream);
    testLogger.info(
      { password: "secret-pass", token: "abc123", phoneNumber: "+15551234567" },
      "safe-log"
    );

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.password).toBe("[REDACTED]");
    expect(logs[0]?.token).toBe("[REDACTED]");
    expect(logs[0]?.phoneNumber).toBe("[REDACTED]");
  });

  test("logs formatted errors with context", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const testLogger = createLogger({ level: "error" }, stream);
    const error = new ValidationError("Invalid payload", {
      cause: new Error("Missing field"),
      context: { module: "bot", action: "process-message" }
    });

    logError(testLogger, error, "Operation failed", { conversationId: "abc-123" });

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.msg).toBe("Operation failed");
    expect(logs[0]?.context).toEqual({ conversationId: "abc-123" });
    expect(logs[0]?.err).toMatchObject({
      code: "VALIDATION_FAILED",
      context: { module: "bot", action: "process-message" }
    });
  });

  test("writes production logs to rotating files and prunes expired ones", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-logs-"));
    const staleLog = join(logDir, "cs-2026-02-20.log");
    writeFileSync(staleLog, "stale");

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 7
    });

    const destination = createProductionLogDestination({
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 7
    });
    const logger = createLogger({}, destination, runtimeConfig);
    logger.info("file-log");

    await waitForAsyncWork();
    const writableDestination = destination as Writable;
    writableDestination.end();
    await finished(writableDestination);

    const currentLogName = readdirSync(logDir).find((entry) => entry !== "cs-2026-02-20.log");
    expect(currentLogName).toBeDefined();

    const currentLog = join(logDir, currentLogName!);
    const currentContents = readFileSync(currentLog, "utf8");

    expect(currentContents).toContain("file-log");
    expect(existsSync(staleLog)).toBe(false);

    rmSync(logDir, { recursive: true, force: true });
  });

  test("rotates log files when the date changes", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-rotate-"));
    let currentDate = new Date("2026-03-06T08:00:00");

    const destination = createProductionLogDestination(
      {
        LOG_DIR: logDir,
        LOG_RETENTION_DAYS: 14
      },
      {
        now: () => currentDate
      }
    );

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14
    });
    const logger = createLogger({}, destination, runtimeConfig);

    logger.info("day-one");
    await waitForAsyncWork();

    currentDate = new Date("2026-03-07T08:00:00");
    logger.info("day-two");
    await waitForAsyncWork();
    const writableDestination = destination as Writable;
    writableDestination.end();
    await finished(writableDestination);

    expect(readFileSync(join(logDir, "cs-2026-03-06.log"), "utf8")).toContain("day-one");
    expect(readFileSync(join(logDir, "cs-2026-03-07.log"), "utf8")).toContain("day-two");

    rmSync(logDir, { recursive: true, force: true });
  });

  test("handles destination stream errors without crashing", async () => {
    class FailingWriteStream extends Writable {
      override _write(
        _chunk: Buffer | string,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void
      ): void {
        callback(new Error("simulated stream failure"));
      }
    }

    const logDir = mkdtempSync(join(tmpdir(), "cs-stream-error-"));
    let recoveredOutput = "";
    let fallbackOutput = "";
    const recoveredStream = new PassThrough();
    const fallbackStream = new PassThrough();
    recoveredStream.on("data", (chunk: Buffer | string) => {
      recoveredOutput += chunk.toString();
    });
    fallbackStream.on("data", (chunk: Buffer | string) => {
      fallbackOutput += chunk.toString();
    });

    const reportedErrors: Error[] = [];
    let streamCreationCount = 0;
    const destination = createProductionLogDestination(
      {
        LOG_DIR: logDir,
        LOG_RETENTION_DAYS: 14
      },
      {
        createStream: () => {
          streamCreationCount += 1;
          if (streamCreationCount === 1) {
            return new FailingWriteStream();
          }

          return recoveredStream;
        },
        fallbackStream,
        onStreamError: (error) => {
          reportedErrors.push(error);
        }
      }
    );

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14
    });
    const logger = createLogger({}, destination, runtimeConfig);

    expect(() => logger.info("first-write-fails")).not.toThrow();
    await waitForAsyncWork();

    expect(() => logger.info("second-write-recovers")).not.toThrow();
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const fallbackLogs = parseLogLines(fallbackOutput);
    const logs = parseLogLines(recoveredOutput);
    expect(fallbackLogs.some((entry) => entry.msg === "first-write-fails")).toBe(true);
    expect(logs.some((entry) => entry.msg === "second-write-recovers")).toBe(true);
    expect(reportedErrors[0]?.message).toContain("simulated stream failure");

    rmSync(logDir, { recursive: true, force: true });
  });

  test("falls back to stderr and retries rotation after initial setup failure", async () => {
    const reportedErrors: Error[] = [];
    let fallbackOutput = "";
    let recoveredOutput = "";
    const fallbackStream = new PassThrough();
    const recoveredStream = new PassThrough();
    fallbackStream.on("data", (chunk: Buffer | string) => {
      fallbackOutput += chunk.toString();
    });
    recoveredStream.on("data", (chunk: Buffer | string) => {
      recoveredOutput += chunk.toString();
    });
    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: join(tmpdir(), "cs-init-failure"),
      LOG_RETENTION_DAYS: 14
    });

    let streamCreationCount = 0;
    const destination = createProductionLogDestination(
      {
        LOG_DIR: runtimeConfig.LOG_DIR,
        LOG_RETENTION_DAYS: runtimeConfig.LOG_RETENTION_DAYS
      },
      {
        createStream: () => {
          streamCreationCount += 1;
          if (streamCreationCount <= 2) {
            throw new Error("simulated initial rotation failure");
          }

          return recoveredStream;
        },
        fallbackStream,
        onStreamError: (error) => {
          reportedErrors.push(error);
        }
      }
    );

    const logger = createLogger({}, destination, runtimeConfig);
    expect(() => logger.info("startup-falls-back")).not.toThrow();
    await waitForAsyncWork();

    expect(() => logger.info("startup-recovers")).not.toThrow();
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const fallbackLogs = parseLogLines(fallbackOutput);
    const recoveredLogs = parseLogLines(recoveredOutput);
    expect(fallbackLogs.some((entry) => entry.msg === "startup-falls-back")).toBe(true);
    expect(recoveredLogs.some((entry) => entry.msg === "startup-recovers")).toBe(true);
    expect(reportedErrors.some((error) => error.message.includes("simulated initial rotation failure"))).toBe(
      true
    );
  });

  test("keeps the previous stream if rotation fails during rollover", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-rotate-degraded-"));
    let currentDate = new Date("2026-03-06T08:00:00");
    let streamCreationCount = 0;
    let output = "";
    const activeStream = new PassThrough();
    activeStream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const reportedErrors: Error[] = [];
    const destination = createProductionLogDestination(
      {
        LOG_DIR: logDir,
        LOG_RETENTION_DAYS: 14
      },
      {
        now: () => currentDate,
        createStream: () => {
          streamCreationCount += 1;
          if (streamCreationCount === 1) {
            return activeStream;
          }

          throw new Error("simulated rollover failure");
        },
        onStreamError: (error) => {
          reportedErrors.push(error);
        }
      }
    );

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14
    });
    const logger = createLogger({}, destination, runtimeConfig);

    logger.info("before-rollover");
    await waitForAsyncWork();

    currentDate = new Date("2026-03-07T08:00:00");
    expect(() => logger.info("after-rollover-failure")).not.toThrow();
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const logs = parseLogLines(output);
    expect(logs.some((entry) => entry.msg === "before-rollover")).toBe(true);
    expect(logs.some((entry) => entry.msg === "after-rollover-failure")).toBe(true);
    expect(reportedErrors.some((error) => error.message.includes("simulated rollover failure"))).toBe(true);

    rmSync(logDir, { recursive: true, force: true });
  });

  test("reports cleanup failures without disabling rotation", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-cleanup-failure-"));
    let currentDate = new Date("2026-03-06T08:00:00");
    let streamCreationCount = 0;
    let rotatedOutput = "";
    const initialStream = new PassThrough();
    const rotatedStream = new PassThrough();
    rotatedStream.on("data", (chunk: Buffer | string) => {
      rotatedOutput += chunk.toString();
    });

    const reportedErrors: Error[] = [];
    const destination = createProductionLogDestination(
      {
        LOG_DIR: logDir,
        LOG_RETENTION_DAYS: 14
      },
      {
        now: () => currentDate,
        createStream: () => {
          streamCreationCount += 1;
          return streamCreationCount === 1 ? initialStream : rotatedStream;
        },
        onStreamError: (error) => {
          reportedErrors.push(error);
        }
      }
    ) as Writable & {
      cleanupExpiredLogs: () => void;
      currentDate: string;
      rotationEnabled: boolean;
    };

    destination.cleanupExpiredLogs = () => {
      throw new Error("simulated cleanup failure");
    };
    destination.currentDate = "2026-03-05";

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14
    });
    const logger = createLogger({}, destination, runtimeConfig);

    logger.info("cleanup-failure-does-not-stop-rotation");
    await waitForAsyncWork();

    destination.end();
    await finished(destination);

    const logs = parseLogLines(rotatedOutput);
    expect(logs.some((entry) => entry.msg === "cleanup-failure-does-not-stop-rotation")).toBe(true);
    expect(reportedErrors.some((error) => error.message.includes("simulated cleanup failure"))).toBe(true);
    expect(destination.rotationEnabled).toBe(true);

    rmSync(logDir, { recursive: true, force: true });
  });
});
