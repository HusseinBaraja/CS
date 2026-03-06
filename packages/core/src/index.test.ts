import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { ValidationError } from "@cs/shared";
import { createLogger, logError } from "./index";

const parseLogLines = (buffer: string): Record<string, unknown>[] =>
  buffer
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

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
});
