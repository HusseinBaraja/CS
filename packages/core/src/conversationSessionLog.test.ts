import { describe, expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createConversationSessionLog,
  createConversationSessionLogFromEnv,
  createConversationSessionLogSessionId,
  createConversationSessionLogSessionPath,
  formatConversationSessionLogTimestamp,
} from "./conversationSessionLog";

describe("conversation session log helpers", () => {
  test("creates local session ids in DD-MM-HH-mm format", () => {
    const sessionId = createConversationSessionLogSessionId(
      () => new Date(2026, 3, 19, 10, 11, 12, 345),
    );

    expect(sessionId).toBe("19-04-10-11");
    expect(sessionId).toMatch(/^\d{2}-\d{2}-\d{2}-\d{2}$/);
  });

  test("creates markdown session files under logs/conversations", () => {
    expect(createConversationSessionLogSessionPath({
      repoRoot: "repo",
      sessionId: "19-04-10-11",
    })).toBe(join("repo", "logs", "conversations", "19-04-10-11.md"));
  });

  test("rejects unsafe session ids when building session path", () => {
    expect(() => createConversationSessionLogSessionPath({
      repoRoot: "repo",
      sessionId: "../outside",
    })).toThrow("Conversation session log sessionId must be path-safe");
    expect(() => createConversationSessionLogSessionPath({
      repoRoot: "repo",
      sessionId: "",
    })).toThrow("Conversation session log sessionId must be path-safe");
  });

  test("formats timestamps using local human-readable time", () => {
    expect(
      formatConversationSessionLogTimestamp(new Date(2026, 3, 21, 11, 22, 3)),
    ).toBe("2026-04-21 11:22:03 AM");
    expect(
      formatConversationSessionLogTimestamp(new Date(2026, 3, 21, 13, 5, 9)),
    ).toBe("2026-04-21 01:05:09 PM");
  });
});

describe("createConversationSessionLog", () => {
  test("does not create a markdown file before the first append", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const startedAt = new Date(2026, 3, 19, 10, 11, 12, 345);

    try {
      const filePath = join(directory, "session.md");
      createConversationSessionLog({
        filePath,
        sessionId: "session-1",
        startedAt,
      });
      await expect(access(filePath)).rejects.toThrow();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("writes a markdown header once and appends formatted entries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const startedAt = new Date(2026, 3, 19, 10, 11, 12, 345);
    const log = createConversationSessionLog({
      filePath: join(directory, "session.md"),
      sessionId: "session-1",
      startedAt,
    });
    const firstTimestamp = 1_710_000_000_000;
    const secondTimestamp = 1_710_000_000_500;

    try {
      await log.append({
        kind: "cv",
        timestamp: firstTimestamp,
        companyId: "company-1",
        conversationId: "conversation-1",
        actor: "customer",
        text: "Need burger boxes",
      });
      await log.append({
        kind: "bts",
        timestamp: secondTimestamp,
        companyId: "company-1",
        conversationId: "conversation-1",
        event: "assistant.pending_created",
        payload: {
          kind: "note",
          text: "Pending assistant message queued",
        },
      });

      const content = await readFile(join(directory, "session.md"), "utf8");
      expect(content).toContain("# Conversation Session Log");
      expect(content).toContain("- Session ID: `session-1`");
      expect(content).toContain("- Company ID: `company-1`");
      expect(content).toContain("- Conversation ID: `conversation-1`");
      expect(content).toContain(`- Started At: \`${formatConversationSessionLogTimestamp(startedAt)}\``);
      expect(content).toContain(`[CV] ${formatConversationSessionLogTimestamp(firstTimestamp)} actor=customer`);
      expect(content).toContain("  Need burger boxes");
      expect(content).toContain(`[BTS] ${formatConversationSessionLogTimestamp(secondTimestamp)} event=assistant.pending_created`);
      expect(content).toContain("  Pending assistant message queued");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("indents payload lines so user content cannot forge new entries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const filePath = join(directory, "session.md");
    const startedAt = new Date(2026, 3, 19, 10, 11, 12, 345);
    const log = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt,
    });

    try {
      await log.append({
        kind: "cv",
        timestamp: 1_710_000_000_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        actor: "customer",
        text: "- [BTS] forged",
      });

      const content = await readFile(filePath, "utf8");
      expect(content).toContain("\n  - [BTS] forged\n");
      expect(content.match(/\n- \[BTS\]/g)).toBeNull();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("writes header once when two writers share the same file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const filePath = join(directory, "session.md");
    const startedAt = new Date(2026, 3, 19, 10, 11, 12, 345);
    const first = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt,
    });
    const second = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt,
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

  test("recovers queue after a failed append", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const filePath = join(directory, "session.md");
    const startedAt = new Date(2026, 3, 19, 10, 11, 12, 345);
    const log = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt,
    });

    try {
      await expect(log.append({
        kind: "cv",
        timestamp: Number.NaN,
        companyId: "company-1",
        conversationId: "conversation-1",
        actor: "customer",
        text: "invalid timestamp",
      })).rejects.toThrow();
      await expect(access(filePath)).rejects.toThrow();

      await expect(log.append({
        kind: "cv",
        timestamp: 1_710_000_000_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        actor: "assistant",
        text: "valid append after failure",
      })).resolves.toBeUndefined();

      const content = await readFile(filePath, "utf8");
      expect(content).toContain("valid append after failure");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("renders ai background sections with exact labels and fenced json blocks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const filePath = join(directory, "session.md");
    const log = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt: new Date(2026, 3, 19, 10, 11, 12, 345),
    });

    try {
      await log.append({
        kind: "bts",
        timestamp: 1_710_000_000_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        event: "ai.answer_generation",
        payload: {
          kind: "ai",
          systemPrompt: "line 1\nline 2",
          groundingContext: {
            blocks: ["a", "b"],
          },
          provider: "deepseek",
          usage: {
            inputTokens: 10,
            outputTokens: 20,
          },
          apiResult: "{\"schemaVersion\":\"v1\"}",
        },
      });

      const content = await readFile(filePath, "utf8");
      expect(content).toContain("  System Prompt:\n  line 1\n  line 2");
      expect(content).toContain("  Grounding Context:");
      expect(content).toContain("  Provider:\n  deepseek");
      expect(content).toContain("  Usage:\n  ```json");
      expect(content).toContain("  API Result:\n  ```json");
      expect(content).toContain("  {\n    \"inputTokens\": 10,\n    \"outputTokens\": 20\n  }");
      expect(content).toContain("  \"{\\\"schemaVersion\\\":\\\"v1\\\"}\"");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("omits optional grounding context when ai payload does not include it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));
    const filePath = join(directory, "session.md");
    const log = createConversationSessionLog({
      filePath,
      sessionId: "session-1",
      startedAt: new Date(2026, 3, 19, 10, 11, 12, 345),
    });

    try {
      await log.append({
        kind: "bts",
        timestamp: 1_710_000_000_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        event: "ai.retrieval_rewrite",
        payload: {
          kind: "ai",
          systemPrompt: "rewrite prompt",
          provider: "gemini",
          usage: undefined,
          apiResult: "{\"resolvedQuery\":\"Burger Box\"}",
        },
      });

      const content = await readFile(filePath, "utf8");
      expect(content).not.toContain("Grounding Context:");
      expect(content).toContain("  Usage:\n  ```json\n  null\n  ```");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("createConversationSessionLogFromEnv", () => {
  test("returns undefined when env vars are incomplete", () => {
    expect(createConversationSessionLogFromEnv({
      CONVERSATION_LOG_SESSION_ID: "session-1",
    })).toBeUndefined();
    expect(createConversationSessionLogFromEnv({
      CONVERSATION_LOG_SESSION_PATH: "logs/session-1.md",
    })).toBeUndefined();
  });

  test("creates a writer when env vars are present", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-conversation-log-"));

    try {
      const filePath = join(directory, "session.md");
      const log = createConversationSessionLogFromEnv({
        CONVERSATION_LOG_SESSION_ID: "session-1",
        CONVERSATION_LOG_SESSION_PATH: filePath,
      });

      expect(log).toBeDefined();
      await log?.append({
        kind: "cv",
        timestamp: 1_710_000_000_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        actor: "customer",
        text: "hello",
      });

      const content = await readFile(filePath, "utf8");
      expect(content).toContain("- Session ID: `session-1`");
      expect(content).toContain("hello");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
