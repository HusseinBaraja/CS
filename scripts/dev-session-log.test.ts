import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createDevSessionLogEnvironment } from "./dev-session-log";

describe("createDevSessionLogEnvironment", () => {
  test("creates one shared session id and markdown path for a dev run", () => {
    const env = createDevSessionLogEnvironment({
      now: () => new Date("2026-04-19T10:11:12.345Z"),
      repoRoot: "C:/repo",
    });

    expect(env.CONVERSATION_LOG_SESSION_ID).toMatch(/^20260419T101112345Z-[0-9a-f-]+$/);
    expect(env.CONVERSATION_LOG_SESSION_PATH).toBe(join(
      "C:/repo",
      "logs",
      "conversations",
      `${env.CONVERSATION_LOG_SESSION_ID}.md`,
    ));
  });
});
