import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { createLogger } from '@cs/core';
import { startBotApp } from './index';

describe("startBotApp", () => {
  test("logs serialized startup failures instead of raw error objects", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });
    const logger = createLogger({ level: "error" }, stream);

    await startBotApp(
      async () => {
        throw new Error("Configured Convex deployment is missing bot runtime backend functions.");
      },
      logger,
    );

    await new Promise((resolve) => setImmediate(resolve));

    const logs = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(logs).toHaveLength(1);
    expect(logs[0]?.msg).toBe("bot startup failed");
    expect(logs[0]).toMatchObject({
      context: {},
      err: expect.objectContaining({
        message: "Configured Convex deployment is missing bot runtime backend functions.",
        name: "Error",
      }),
    });
  });
});
