import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import { ValidationError } from "@cs/shared";
import {
  createLogger,
  createLoggerRuntimeConfig,
  createProductionLogDestination,
  logError
} from "./index";

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
    const writableDestination = destination as PassThrough;
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
    const writableDestination = destination as PassThrough;
    writableDestination.end();
    await finished(writableDestination);

    expect(readFileSync(join(logDir, "cs-2026-03-06.log"), "utf8")).toContain("day-one");
    expect(readFileSync(join(logDir, "cs-2026-03-07.log"), "utf8")).toContain("day-two");

    rmSync(logDir, { recursive: true, force: true });
  });
});
