import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ValidationError } from '@cs/shared';
import {
  createLogger,
  createLoggerRuntimeConfig,
  createProductionLogDestination,
  logError,
  logEvent,
  redactJidForLog,
  redactPhoneLikeValue,
  serializeErrorForLog,
  summarizeTextForLog,
  withLogBindings,
} from './index';

const parseLogLines = (buffer: string): Record<string, unknown>[] =>
  buffer
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const waitForAsyncWork = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const waitForCondition = async (predicate: () => boolean, message: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }

    await waitForAsyncWork();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error(message);
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
      "safe-log",
    );

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.password).toBe("[REDACTED]");
    expect(logs[0]?.token).toBe("[REDACTED]");
    expect(logs[0]?.phoneNumber).toBe("[REDACTED]");
  });

  test("serializes errors for structured logs", () => {
    const error = new ValidationError("Invalid payload", {
      cause: new Error("Missing field"),
      context: { module: "bot", action: "process-message" },
    });

    expect(serializeErrorForLog(error)).toMatchObject({
      code: "VALIDATION_FAILED",
      context: { module: "bot", action: "process-message" },
      message: "Invalid payload",
    });
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
      context: { module: "bot", action: "process-message" },
    });

    logError(testLogger, error, "Operation failed", { conversationId: "abc-123" });

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.msg).toBe("Operation failed");
    expect(logs[0]?.context).toEqual({ conversationId: "abc-123" });
    expect(logs[0]?.event).toBe("core.log.error");
    expect(logs[0]?.error).toMatchObject({
      code: "VALIDATION_FAILED",
      context: { module: "bot", action: "process-message" },
    });
  });

  test("logs structured events with required fields", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const testLogger = createLogger({ level: "info" }, stream);
    logEvent(
      testLogger,
      "info",
      {
        event: "api.request.completed",
        runtime: "api",
        surface: "http",
        outcome: "success",
        requestId: "req-1",
      },
      "request completed",
    );

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: "api.request.completed",
      runtime: "api",
      surface: "http",
      outcome: "success",
      requestId: "req-1",
      msg: "request completed",
    });
  });

  test("merges child bindings for loggers without child support", () => {
    const infoCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];
    const baseLogger = {
      info(payload: Record<string, unknown>, message: string) {
        infoCalls.push({ payload, message });
      },
      warn() {},
      error() {},
    };

    const boundLogger = withLogBindings(baseLogger, { runtime: "bot", companyId: "company-1" });
    boundLogger.info({ event: "bot.message.received", surface: "router", outcome: "received" }, "inbound");

    expect(infoCalls).toEqual([
      {
        payload: {
          runtime: "bot",
          companyId: "company-1",
          event: "bot.message.received",
          surface: "router",
          outcome: "received",
        },
        message: "inbound",
      },
    ]);
  });

  test("summarizes text without leaking raw content", () => {
    const summary = summarizeTextForLog("hello\nworld");

    expect(summary).toMatchObject({
      textLength: 11,
      textLineCount: 2,
    });
    expect(summary.textSha256).toBeDefined();
    expect(Object.values(summary)).not.toContain("hello\nworld");
  });

  test("redacts phone-like values and JIDs", () => {
    expect(redactPhoneLikeValue("+967-777-123-456")).toBe("***3456");
    expect(redactJidForLog("967777123456@s.whatsapp.net")).toBe("***3456@s.whatsapp.net");
  });

  test("writes production logs to rotating files and prunes expired ones", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-logs-"));
    const staleLog = join(logDir, "cs-2026-02-20.log");
    writeFileSync(staleLog, "stale");

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 7,
    });

    const destination = createProductionLogDestination({
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 7,
    }) as Writable & { stream: Writable | null };
    const logger = createLogger({}, destination, runtimeConfig);

    await waitForCondition(() => destination.stream !== null, "expected initial log stream to be ready");
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
        LOG_RETENTION_DAYS: 14,
      },
      {
        now: () => currentDate,
      },
    ) as Writable & { stream: Writable | null; currentDate: string };

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14,
    });
    const logger = createLogger({}, destination, runtimeConfig);

    await waitForCondition(() => destination.stream !== null, "expected day-one log stream to be ready");
    logger.info("day-one");
    await waitForAsyncWork();

    currentDate = new Date("2026-03-07T08:00:00");
    logger.info("day-two-trigger");
    await waitForCondition(
      () => destination.currentDate === "2026-03-07",
      "expected rotation to switch to the next daily log file",
    );
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
        callback: (error?: Error | null) => void,
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
        LOG_RETENTION_DAYS: 14,
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
        },
      },
    ) as Writable & { stream: Writable | null };

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14,
    });
    const logger = createLogger({}, destination, runtimeConfig);

    await waitForCondition(() => destination.stream !== null, "expected initial stream to be active");
    expect(() => logger.info("first-write-fails")).not.toThrow();
    await waitForAsyncWork();

    expect(() => logger.info("second-write-falls-back")).not.toThrow();
    await waitForCondition(() => destination.stream === recoveredStream, "expected recovered stream to be active");

    expect(() => logger.info("third-write-recovers")).not.toThrow();
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const fallbackLogs = parseLogLines(fallbackOutput);
    const logs = parseLogLines(recoveredOutput);
    expect(fallbackLogs.some((entry) => entry.msg === "first-write-fails")).toBe(true);
    expect(fallbackLogs.some((entry) => entry.msg === "second-write-falls-back")).toBe(true);
    expect(logs.some((entry) => entry.msg === "third-write-recovers")).toBe(true);
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
      LOG_RETENTION_DAYS: 14,
    });

    let streamCreationCount = 0;
    const destination = createProductionLogDestination(
      {
        LOG_DIR: runtimeConfig.LOG_DIR,
        LOG_RETENTION_DAYS: runtimeConfig.LOG_RETENTION_DAYS,
      },
      {
        createStream: () => {
          streamCreationCount += 1;
          if (streamCreationCount === 1) {
            throw new Error("simulated initial rotation failure");
          }

          return recoveredStream;
        },
        fallbackStream,
        onStreamError: (error) => {
          reportedErrors.push(error);
        },
      },
    ) as Writable & { stream: Writable | null };

    const logger = createLogger({}, destination, runtimeConfig);
    await waitForCondition(
      () => reportedErrors.some((error) => error.message.includes("simulated initial rotation failure")),
      "expected initial background rotation failure to be reported",
    );

    expect(() => logger.info("startup-falls-back")).not.toThrow();
    await waitForCondition(() => destination.stream === recoveredStream, "expected retry rotation to recover");

    expect(() => logger.info("startup-recovers")).not.toThrow();
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const fallbackLogs = parseLogLines(fallbackOutput);
    const recoveredLogs = parseLogLines(recoveredOutput);
    expect(fallbackLogs.some((entry) => entry.msg === "startup-falls-back")).toBe(true);
    expect(recoveredLogs.some((entry) => entry.msg === "startup-recovers")).toBe(true);
    expect(reportedErrors.some((error) => error.message.includes("simulated initial rotation failure"))).toBe(
      true,
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
        LOG_RETENTION_DAYS: 14,
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
        },
      },
    ) as Writable & { stream: Writable | null };

    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14,
    });
    const logger = createLogger({}, destination, runtimeConfig);

    await waitForCondition(() => destination.stream === activeStream, "expected initial stream to be active");
    logger.info("before-rollover");
    await waitForAsyncWork();

    currentDate = new Date("2026-03-07T08:00:00");
    expect(() => logger.info("after-rollover-failure")).not.toThrow();
    await waitForCondition(
      () => reportedErrors.some((error) => error.message.includes("simulated rollover failure")),
      "expected rollover failure to be reported",
    );

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
        LOG_RETENTION_DAYS: 14,
      },
      {
        now: () => currentDate,
        createStream: () => {
          streamCreationCount += 1;
          return streamCreationCount === 1 ? initialStream : rotatedStream;
        },
        onStreamError: (error) => {
          reportedErrors.push(error);
        },
      },
    ) as Writable & {
      cleanupExpiredLogs: () => Promise<void>;
      currentDate: string;
      rotationEnabled: boolean;
      stream: Writable | null;
    };

    destination.cleanupExpiredLogs = async () => {
      throw new Error("simulated cleanup failure");
    };
    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14,
    });
    const logger = createLogger({}, destination, runtimeConfig);

    await waitForCondition(() => destination.stream === initialStream, "expected initial cleanup test stream");
    destination.currentDate = "2026-03-05";
    logger.info("cleanup-failure-trigger");
    await waitForCondition(() => destination.stream === rotatedStream, "expected rotated stream after trigger");
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
