import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createConversationSessionLog,
  createConversationSessionLogSessionId,
  createConversationSessionLogSessionPath,
} from "./conversationSessionLog";

describe("conversation session log helpers", () => {
  test("creates path-safe unique session ids", () => {
    const first = createConversationSessionLogSessionId(() => new Date("2026-04-19T10:11:12.345Z"));
    const second = createConversationSessionLogSessionId(() => new Date("2026-04-19T10:11:12.345Z"));

    expect(first).toMatch(/^20260419T101112345Z-[0-9a-f-]+$/);
    expect(second).toMatch(/^20260419T101112345Z-[0-9a-f-]+$/);
    expect(first).not.toBe(second);
    expect(first.includes("/")).toBe(false);
    expect(first.includes("\\")).toBe(false);
  });

  test("creates markdown session files under the target directory", () => {
    expect(createConversationSessionLogSessionPath({
      logDirectory: "logs/conversations",
      sessionId: "20260419T101112345Z-session",
    })).toBe(join("logs/conversations", "20260419T101112345Z-session.md"));
  });
});

describe("createConversationSessionLog", () => {
  test("creates the markdown file header eagerly for a new session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));

    try {
      createConversationSessionLog({
        filePath: join(directory, "session.md"),
        sessionId: "session-1",
        startedAt: new Date("2026-04-19T10:11:12.345Z"),
      });
      await Bun.sleep(25);

      const content = await readFile(join(directory, "session.md"), "utf8");
      expect(content).toContain("# Conversation Session Log");
      expect(content).toContain("- Session ID: `session-1`");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("writes a markdown header once and appends formatted entries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const log = createConversationSessionLog({
      filePath: join(directory, "session.md"),
      sessionId: "session-1",
      startedAt: new Date("2026-04-19T10:11:12.345Z"),
    });

    try {
      await log.append({
        kind: "cv",
        timestamp: 1_710_000_000_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        actor: "customer",
        text: "Need burger boxes",
      });
      await log.append({
        kind: "bts",
        timestamp: 1_710_000_000_500,
        companyId: "company-1",
        conversationId: "conversation-1",
        event: "assistant.pending_created",
        details: "Pending assistant message queued",
      });

      const content = await readFile(join(directory, "session.md"), "utf8");
      expect(content).toContain("# Conversation Session Log");
      expect(content).toContain("- Session ID: `session-1`");
      expect(content).toContain("[CV] 2024-03-09T16:00:00.000Z company=company-1 conversation=conversation-1 actor=customer");
      expect(content).toContain("Need burger boxes");
      expect(content).toContain("[BTS] 2024-03-09T16:00:00.500Z company=company-1 conversation=conversation-1 event=assistant.pending_created");
      expect(content).toContain("Pending assistant message queued");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("writes header once when two writers share the same file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const filePath = join(directory, "session.md");
    const first = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt: new Date("2026-04-19T10:11:12.345Z"),
    });
    const second = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt: new Date("2026-04-19T10:11:12.345Z"),
    });

    try {
      await Promise.all([
        first.append({
          kind: "cv",
          timestamp: 1_710_000_000_000,
          companyId: "company-1",
          conversationId: "conversation-1",
          actor: "customer",
          text: "first writer",
        }),
        second.append({
          kind: "cv",
          timestamp: 1_710_000_000_001,
          companyId: "company-1",
          conversationId: "conversation-1",
          actor: "assistant",
          text: "second writer",
        }),
      ]);

      const content = await readFile(filePath, "utf8");
      expect(content.match(/# Conversation Session Log/g)?.length ?? 0).toBe(1);
      expect(content).toContain("first writer");
      expect(content).toContain("second writer");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
