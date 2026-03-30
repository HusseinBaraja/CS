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
      {
        password: "secret-pass",
        token: "abc123",
        phoneNumber: "+15551234567",
        error: {
          context: {
            apiKey: "sensitive-api-key",
            phoneNumber: "+967700000001",
          },
          cause: {
            context: {
              token: "nested-token",
            },
            message: "nested cause",
            name: "NestedError",
          },
          code: "VALIDATION_FAILED",
          message: "top-level message",
          name: "ValidationError",
        },
      },
      "safe-log",
    );

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.password).toBe("[REDACTED]");
    expect(logs[0]?.token).toBe("[REDACTED]");
    expect(logs[0]?.phoneNumber).toBe("[REDACTED]");
    expect(logs[0]?.error).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "top-level message",
      name: "ValidationError",
      context: {
        apiKey: "[REDACTED]",
        phoneNumber: "[REDACTED]",
      },
      cause: {
        message: "nested cause",
        name: "NestedError",
        context: {
          token: "[REDACTED]",
        },
      },
    });
  });

  test("preserves baseline redaction when callers add custom redact rules", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const testLogger = createLogger(
      {
        level: "info",
        redact: {
          paths: ["customSecret"],
          censor: "[MASKED]",
        },
      },
      stream,
    );

    testLogger.info(
      {
        password: "secret-pass",
        customSecret: "custom-value",
      },
      "safe-log",
    );

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.password).toBe("[MASKED]");
    expect(logs[0]?.customSecret).toBe("[MASKED]");
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

    logError(testLogger, error, "Operation failed", {
      context: { conversationId: "abc-123" },
    });

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

  test("allows logError callers to override the event envelope", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const testLogger = createLogger({ level: "error" }, stream);
    logError(
      testLogger,
      new Error("startup failed"),
      "bot startup failed",
      {
        context: { retryable: false },
        envelopeOverrides: {
          event: "bot.runtime.startup_failed",
          runtime: "bot",
          surface: "runtime",
          outcome: "failed",
          sessionKey: "company-company-1",
        },
      },
    );

    await new Promise((resolve) => setImmediate(resolve));

    const logs = parseLogLines(output);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: "bot.runtime.startup_failed",
      runtime: "bot",
      surface: "runtime",
      outcome: "failed",
      sessionKey: "company-company-1",
      context: { retryable: false },
      error: expect.objectContaining({
        message: "startup failed",
        name: "Error",
      }),
      msg: "bot startup failed",
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

  test("throws when a logger is missing the requested method for logEvent", () => {
    const loggerWithoutDebug = {
      info() {},
      warn() {},
      error() {},
    };

    expect(() =>
      logEvent(
        loggerWithoutDebug,
        "debug",
        {
          event: "bot.message.received",
          outcome: "received",
          runtime: "bot",
          surface: "router",
        },
        "inbound",
      )).toThrow('Structured logger is missing "debug" method');
  });

  test("throws when a bound logger is missing the requested method", () => {
    const loggerWithoutDebug = {
      info() {},
      warn() {},
      error() {},
    };
    const boundLogger = withLogBindings(loggerWithoutDebug, { runtime: "bot" });

    expect(() =>
      boundLogger.debug?.(
        {
          event: "bot.message.received",
          surface: "router",
          outcome: "received",
        },
        "inbound",
      )).toThrow('Structured logger is missing "debug" method');
  });

  test("summarizes text without leaking raw content", () => {
    const summary = summarizeTextForLog("hello\nworld");

    expect(summary).toMatchObject({
      textLength: 11,
      textLineCount: 2,
    });
    expect(summary).not.toHaveProperty("textSha256");
    expect(Object.values(summary)).not.toContain("hello\nworld");
  });

  test("redacts phone-like values and JIDs", () => {
    expect(redactPhoneLikeValue("12")).toBe("[redacted]");
    expect(redactPhoneLikeValue("1234")).toBe("[redacted]");
    expect(redactPhoneLikeValue("+967-777-123-456")).toBe("***3456");
    expect(redactJidForLog("1234@s.whatsapp.net")).toBe("[redacted]@s.whatsapp.net");
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

  test("clamps invalid retention values and keeps the current day", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-retention-clamp-"));
    const todayLog = join(logDir, "cs-2026-03-06.log");
    const previousDayLog = join(logDir, "cs-2026-03-05.log");
    const olderLog = join(logDir, "cs-2026-03-04.log");
    writeFileSync(todayLog, "today");
    writeFileSync(previousDayLog, "previous");
    writeFileSync(olderLog, "older");

    const destination = createProductionLogDestination(
      {
        LOG_DIR: logDir,
        LOG_RETENTION_DAYS: 0,
      },
      {
        now: () => new Date("2026-03-06T23:30:00"),
        createStream: () => new PassThrough(),
      },
    ) as Writable;

    await waitForCondition(
      () => existsSync(todayLog) && !existsSync(previousDayLog) && !existsSync(olderLog),
      "expected retention clamp to keep only the current calendar day",
    );

    destination.end();
    await finished(destination);
    rmSync(logDir, { recursive: true, force: true });
  });

  test("retention uses calendar days rather than 24-hour windows", async () => {
    const lateNight = new Date("2026-03-06T23:30:00");
    const runCleanup = async (retentionDays: number, logDir: string): Promise<void> => {
      const destination = createProductionLogDestination(
        {
          LOG_DIR: logDir,
          LOG_RETENTION_DAYS: retentionDays,
        },
        {
          now: () => lateNight,
          createStream: () => new PassThrough(),
        },
      ) as Writable & { cleanupExpiredLogs: () => Promise<void> };

      await destination.cleanupExpiredLogs();
      destination.end();
      await finished(destination);
    };

    const calendarLogDir = mkdtempSync(join(tmpdir(), "cs-retention-calendar-"));
    const todayLog = join(calendarLogDir, "cs-2026-03-06.log");
    const yesterdayLog = join(calendarLogDir, "cs-2026-03-05.log");
    const twoDaysAgoLog = join(calendarLogDir, "cs-2026-03-04.log");
    writeFileSync(todayLog, "today");
    writeFileSync(yesterdayLog, "yesterday");
    writeFileSync(twoDaysAgoLog, "older");

    await runCleanup(2, calendarLogDir);

    expect(existsSync(todayLog)).toBe(true);
    expect(existsSync(yesterdayLog)).toBe(true);
    expect(existsSync(twoDaysAgoLog)).toBe(false);

    rmSync(calendarLogDir, { recursive: true, force: true });

    const flooredLogDir = mkdtempSync(join(tmpdir(), "cs-retention-floored-"));
    const flooredTodayLog = join(flooredLogDir, "cs-2026-03-06.log");
    const flooredYesterdayLog = join(flooredLogDir, "cs-2026-03-05.log");
    writeFileSync(flooredTodayLog, "today");
    writeFileSync(flooredYesterdayLog, "yesterday");

    await runCleanup(1.9, flooredLogDir);

    expect(existsSync(flooredTodayLog)).toBe(true);
    expect(existsSync(flooredYesterdayLog)).toBe(false);

    rmSync(flooredLogDir, { recursive: true, force: true });
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

  test("startup writes wait for scheduled rotation before choosing a destination", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-startup-pending-"));
    const scheduledTasks: Array<() => void> = [];
    let activeOutput = "";
    let fallbackOutput = "";
    const activeStream = new PassThrough();
    const fallbackStream = new PassThrough();
    activeStream.on("data", (chunk: Buffer | string) => {
      activeOutput += chunk.toString();
    });
    fallbackStream.on("data", (chunk: Buffer | string) => {
      fallbackOutput += chunk.toString();
    });

    const destination = createProductionLogDestination(
      {
        LOG_DIR: logDir,
        LOG_RETENTION_DAYS: 14,
      },
      {
        createStream: () => activeStream,
        fallbackStream,
        scheduleTask: (task) => {
          scheduledTasks.push(task);
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

    expect(destination.stream).toBeNull();
    logger.info("queued-before-startup-rotation");
    await waitForAsyncWork();

    expect(parseLogLines(activeOutput)).toHaveLength(0);
    expect(parseLogLines(fallbackOutput)).toHaveLength(0);

    const scheduledRotation = scheduledTasks.shift();
    expect(scheduledRotation).toBeDefined();
    scheduledRotation?.();

    await waitForCondition(
      () => parseLogLines(activeOutput).some((entry) => entry.msg === "queued-before-startup-rotation"),
      "expected queued startup write to flush into the created stream",
    );

    destination.end();
    await finished(destination);
    rmSync(logDir, { recursive: true, force: true });
  });

  test("post-midnight writes wait for scheduled rotation and land in the new day stream", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "cs-midnight-pending-"));
    const scheduledTasks: Array<() => void> = [];
    let currentDate = new Date("2026-03-06T08:00:00");
    let dayOneOutput = "";
    let dayTwoOutput = "";
    const dayOneStream = new PassThrough();
    const dayTwoStream = new PassThrough();
    dayOneStream.on("data", (chunk: Buffer | string) => {
      dayOneOutput += chunk.toString();
    });
    dayTwoStream.on("data", (chunk: Buffer | string) => {
      dayTwoOutput += chunk.toString();
    });

    let streamCreationCount = 0;
    const destination = createProductionLogDestination(
      {
        LOG_DIR: logDir,
        LOG_RETENTION_DAYS: 14,
      },
      {
        now: () => currentDate,
        createStream: () => {
          streamCreationCount += 1;
          return streamCreationCount === 1 ? dayOneStream : dayTwoStream;
        },
        scheduleTask: (task) => {
          scheduledTasks.push(task);
        },
      },
    ) as Writable & { currentDate: string; stream: Writable | null };
    const runtimeConfig = createLoggerRuntimeConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_DIR: logDir,
      LOG_RETENTION_DAYS: 14,
    });
    const logger = createLogger({}, destination, runtimeConfig);

    const initialRotation = scheduledTasks.shift();
    expect(initialRotation).toBeDefined();
    initialRotation?.();
    await waitForCondition(() => destination.stream === dayOneStream, "expected day-one stream to be active");
    while (scheduledTasks.length > 0) {
      scheduledTasks.shift()?.();
    }

    logger.info("day-one");
    await waitForAsyncWork();

    currentDate = new Date("2026-03-07T08:00:00");
    logger.info("queued-for-day-two");
    await waitForAsyncWork();

    expect(parseLogLines(dayOneOutput).some((entry) => entry.msg === "queued-for-day-two")).toBe(false);

    while (scheduledTasks.length > 0) {
      scheduledTasks.shift()?.();
    }

    await waitForCondition(
      () => parseLogLines(dayTwoOutput).some((entry) => entry.msg === "queued-for-day-two"),
      "expected queued rollover write to flush into the new day stream",
    );

    destination.end();
    await finished(destination);
    rmSync(logDir, { recursive: true, force: true });
  });

  test("falls back after destination stream errors without retrying rotation", async () => {
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
    let fallbackOutput = "";
    const fallbackStream = new PassThrough();
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
          return new FailingWriteStream();
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
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const fallbackLogs = parseLogLines(fallbackOutput);
    expect(fallbackLogs.some((entry) => entry.msg === "first-write-fails")).toBe(true);
    expect(fallbackLogs.some((entry) => entry.msg === "second-write-falls-back")).toBe(true);
    expect(reportedErrors[0]?.message).toContain("simulated stream failure");
    expect(streamCreationCount).toBe(1);
    expect(destination.stream).toBeNull();

    rmSync(logDir, { recursive: true, force: true });
  });

  test("falls back to stderr and stops retrying after initial setup failure", async () => {
    const reportedErrors: Error[] = [];
    let fallbackOutput = "";
    const fallbackStream = new PassThrough();
    fallbackStream.on("data", (chunk: Buffer | string) => {
      fallbackOutput += chunk.toString();
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
          throw new Error("simulated initial rotation failure");
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
    await waitForAsyncWork();
    expect(() => logger.info("startup-still-fallback")).not.toThrow();
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const fallbackLogs = parseLogLines(fallbackOutput);
    expect(fallbackLogs.some((entry) => entry.msg === "startup-falls-back")).toBe(true);
    expect(fallbackLogs.some((entry) => entry.msg === "startup-still-fallback")).toBe(true);
    expect(reportedErrors.some((error) => error.message.includes("simulated initial rotation failure"))).toBe(
      true,
    );
    expect(streamCreationCount).toBe(1);
    expect(destination.stream).toBeNull();
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
    expect(destination.stream).toBe(activeStream);

    expect(() => logger.info("after-rollover-stays-on-old-stream")).not.toThrow();
    await waitForAsyncWork();

    destination.end();
    await finished(destination as Writable);

    const logs = parseLogLines(output);
    expect(logs.some((entry) => entry.msg === "before-rollover")).toBe(true);
    expect(logs.some((entry) => entry.msg === "after-rollover-failure")).toBe(true);
    expect(logs.some((entry) => entry.msg === "after-rollover-stays-on-old-stream")).toBe(true);
    expect(reportedErrors.some((error) => error.message.includes("simulated rollover failure"))).toBe(true);
    expect(streamCreationCount).toBe(2);

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
