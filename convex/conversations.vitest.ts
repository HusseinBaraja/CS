import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("conversations", () => {
  it("gets or creates one active conversation per company and phone number", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );

    const firstConversation = await t.action(internal.conversations.getOrCreateActiveConversation, {
      companyId,
      phoneNumber: "967700000001",
      now: 1_000,
    });
    const secondConversation = await t.action(internal.conversations.getOrCreateActiveConversation, {
      companyId,
      phoneNumber: "967700000001",
      now: 2_000,
    });

    expect(secondConversation).toEqual(firstConversation);
    const stored = await t.run(async (ctx) => ctx.db.query("conversations").collect());
    expect(stored).toHaveLength(1);
  });

  it("keeps conversations isolated for the same phone number across companies", async () => {
    const t = convexTest(schema, modules);
    const companyA = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const companyB = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant B",
        ownerPhone: "966500000001",
      })
    );

    const conversationA = await t.action(internal.conversations.getOrCreateActiveConversation, {
      companyId: companyA,
      phoneNumber: "967700000001",
    });
    const conversationB = await t.action(internal.conversations.getOrCreateActiveConversation, {
      companyId: companyB,
      phoneNumber: "967700000001",
    });

    expect(conversationA.id).not.toBe(conversationB.id);
  });

  it("appends messages with company-scoped conversation validation", async () => {
    const t = convexTest(schema, modules);
    const companyA = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const companyB = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant B",
        ownerPhone: "966500000001",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId: companyA,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await expect(
      t.mutation(internal.conversations.appendConversationMessage, {
        companyId: companyB,
        conversationId,
        role: "user",
        content: "hello",
        timestamp: 1_000,
      }),
    ).rejects.toThrow("Conversation not found for company");
  });

  it("rejects empty message content", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await expect(
      t.mutation(internal.conversations.appendConversationMessage, {
        companyId,
        conversationId,
        role: "assistant",
        content: "   ",
      }),
    ).rejects.toThrow("content must be a non-empty string");
  });

  it("lists messages ordered by ascending timestamp", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "third",
      timestamp: 3_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "first",
      timestamp: 1_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "second",
      timestamp: 2_000,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
    });
    expect(messages.map((message) => message.content)).toEqual(["first", "second", "third"]);
  });

  it("returns the latest limited messages in ascending timestamp order", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "first",
      timestamp: 1_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "second",
      timestamp: 2_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "third",
      timestamp: 3_000,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
      limit: 2,
    });

    expect(messages.map((message) => message.content)).toEqual(["second", "third"]);
  });

  it("returns the latest prompt turns in ascending order for synthetic timestamps", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "third",
      timestamp: 3_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "first",
      timestamp: 1_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "second",
      timestamp: 2_000,
    });

    const history = await t.query(internal.conversations.getPromptHistory, {
      companyId,
      conversationId,
      limit: 2,
    });

    expect(history).toEqual([
      { role: "assistant", text: "second" },
      { role: "assistant", text: "third" },
    ]);
  });

  it("returns realistic interleaved prompt history in chronological order", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "first question",
      timestamp: 1_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "first answer",
      timestamp: 2_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "follow up",
      timestamp: 3_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "second answer",
      timestamp: 4_000,
    });

    const history = await t.query(internal.conversations.getPromptHistory, {
      companyId,
      conversationId,
      limit: 4,
    });

    expect(history).toEqual([
      { role: "user", text: "first question" },
      { role: "assistant", text: "first answer" },
      { role: "user", text: "follow up" },
      { role: "assistant", text: "second answer" },
    ]);
  });

  it("returns empty prompt history for conversations without messages", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    const history = await t.query(internal.conversations.getPromptHistory, {
      companyId,
      conversationId,
      limit: 20,
    });

    expect(history).toEqual([]);
  });

  it("rejects prompt history reads for the wrong company", async () => {
    const t = convexTest(schema, modules);
    const companyA = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const companyB = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant B",
        ownerPhone: "966500000001",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId: companyA,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await expect(
      t.query(internal.conversations.getPromptHistory, {
        companyId: companyB,
        conversationId,
        limit: 20,
      }),
    ).rejects.toThrow("Conversation not found for company");
  });

  it("trims only the oldest excess messages for a conversation", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    for (let index = 1; index <= 23; index += 1) {
      await t.mutation(internal.conversations.appendConversationMessage, {
        companyId,
        conversationId,
        role: index % 2 === 0 ? "assistant" : "user",
        content: `message-${index}`,
        timestamp: index,
      });
    }

    const trimResult = await t.mutation(internal.conversations.trimConversationMessages, {
      companyId,
      conversationId,
      maxMessages: 20,
    });
    const remainingMessages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
    });

    expect(trimResult).toEqual({
      deletedCount: 3,
      remainingCount: 20,
    });
    expect(remainingMessages).toHaveLength(20);
    expect(remainingMessages[0]?.content).toBe("message-4");
    expect(remainingMessages.at(-1)?.content).toBe("message-23");
  });

  it("makes trimming idempotent when the conversation is already within the limit", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    for (let index = 1; index <= 2; index += 1) {
      await t.mutation(internal.conversations.appendConversationMessage, {
        companyId,
        conversationId,
        role: "user",
        content: `message-${index}`,
        timestamp: index,
      });
    }

    const firstTrim = await t.mutation(internal.conversations.trimConversationMessages, {
      companyId,
      conversationId,
      maxMessages: 20,
    });
    const secondTrim = await t.mutation(internal.conversations.trimConversationMessages, {
      companyId,
      conversationId,
      maxMessages: 20,
    });

    expect(firstTrim).toEqual({
      deletedCount: 0,
      remainingCount: 2,
    });
    expect(secondTrim).toEqual({
      deletedCount: 0,
      remainingCount: 2,
    });
  });

  it("trims large conversations across multiple batches", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    for (let index = 1; index <= 205; index += 1) {
      await t.mutation(internal.conversations.appendConversationMessage, {
        companyId,
        conversationId,
        role: index % 2 === 0 ? "assistant" : "user",
        content: `message-${index}`,
        timestamp: index,
      });
    }

    const trimResult = await t.mutation(internal.conversations.trimConversationMessages, {
      companyId,
      conversationId,
      maxMessages: 20,
    });
    const remainingMessages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
    });

    expect(trimResult).toEqual({
      deletedCount: 185,
      remainingCount: 20,
    });
    expect(remainingMessages).toHaveLength(20);
    expect(remainingMessages[0]?.content).toBe("message-186");
    expect(remainingMessages.at(-1)?.content).toBe("message-205");
  });

  it("rejects trims for the wrong company", async () => {
    const t = convexTest(schema, modules);
    const companyA = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const companyB = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant B",
        ownerPhone: "966500000001",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId: companyA,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await expect(
      t.mutation(internal.conversations.trimConversationMessages, {
        companyId: companyB,
        conversationId,
        maxMessages: 20,
      }),
    ).rejects.toThrow("Conversation not found for company");
  });

  it("returns the oldest active conversation when duplicates already exist", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );

    const firstConversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );
    await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    const conversation = await t.action(internal.conversations.getOrCreateActiveConversation, {
      companyId,
      phoneNumber: "967700000001",
    });

    expect(conversation.id).toBe(firstConversationId);
    const stored = await t.run(async (ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("by_company_phone_and_muted", (q) =>
          q.eq("companyId", companyId).eq("phoneNumber", "967700000001").eq("muted", false)
        )
        .collect()
    );
    expect(stored).toHaveLength(2);
  });

  it("reuses muted conversations for inbound routing instead of creating a new one", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const existingConversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 1_000,
        lastCustomerMessageAt: 1_000,
        nextAutoResumeAt: 2_000,
      })
    );

    const conversation = await t.action(internal.conversations.getOrCreateConversationForInbound, {
      companyId,
      phoneNumber: "967700000001",
      now: 2_000,
    });

    expect(conversation.id).toBe(existingConversationId);
    const stored = await t.run(async (ctx) => ctx.db.query("conversations").collect());
    expect(stored).toHaveLength(1);
  });

  it("starts handoff once and records an audit event", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    const first = await t.mutation(internal.conversations.startHandoff, {
      companyId,
      conversationId,
      triggerTimestamp: 2_000,
      source: "assistant_action",
    });
    const second = await t.mutation(internal.conversations.startHandoff, {
      companyId,
      conversationId,
      triggerTimestamp: 3_000,
      source: "assistant_action",
    });

    expect(first).toMatchObject({
      id: conversationId,
      muted: true,
      mutedAt: 2_000,
      lastCustomerMessageAt: 2_000,
      nextAutoResumeAt: 2_000 + 12 * 60 * 60 * 1_000,
    });
    expect(second).toEqual(first);

    const stateEvents = await t.run(async (ctx) =>
      ctx.db.query("conversationStateEvents").collect()
    );
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]?.eventType).toBe("handoff_started");
  });

  it("atomically appends the assistant handoff reply while muting the conversation", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    const updated = await t.mutation(internal.conversations.appendAssistantMessageAndStartHandoff, {
      companyId,
      conversationId,
      content: "Connecting you with the team.",
      timestamp: 2_000,
      source: "assistant_action",
    });

    expect(updated).toMatchObject({
      id: conversationId,
      muted: true,
      mutedAt: 2_000,
      lastCustomerMessageAt: 2_000,
      nextAutoResumeAt: 2_000 + 12 * 60 * 60 * 1_000,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
    });
    expect(messages).toEqual([{
      id: expect.any(String),
      conversationId,
      role: "assistant",
      content: "Connecting you with the team.",
      timestamp: 2_000,
    }]);

    const stateEvents = await t.run(async (ctx) =>
      ctx.db.query("conversationStateEvents").collect()
    );
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]).toMatchObject({
      conversationId,
      eventType: "handoff_started",
      timestamp: 2_000,
      source: "assistant_action",
    });
  });

  it("resumes muted conversations and clears the live mute state", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 1_000,
        lastCustomerMessageAt: 1_000,
        nextAutoResumeAt: 2_000,
      })
    );

    const resumed = await t.mutation(internal.conversations.resumeConversation, {
      companyId,
      conversationId,
      resumedAt: 3_000,
      source: "worker_auto",
    });

    expect(resumed).toMatchObject({
      id: conversationId,
      muted: false,
      lastCustomerMessageAt: 1_000,
    });
    expect(resumed.nextAutoResumeAt).toBeUndefined();
    expect(resumed.mutedAt).toBeUndefined();

    const stateEvents = await t.run(async (ctx) =>
      ctx.db.query("conversationStateEvents").collect()
    );
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]?.eventType).toBe("handoff_resumed_auto");
  });

  it("extends the auto-resume deadline when muted customers send new messages", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 1_000,
        lastCustomerMessageAt: 1_000,
        nextAutoResumeAt: 2_000,
      })
    );

    const updated = await t.mutation(internal.conversations.recordMutedCustomerActivity, {
      companyId,
      conversationId,
      timestamp: 5_000,
    });

    expect(updated.lastCustomerMessageAt).toBe(5_000);
    expect(updated.nextAutoResumeAt).toBe(5_000 + 12 * 60 * 60 * 1_000);
    const dueConversations = await t.query(internal.conversations.listDueAutoResumeConversations, {
      now: 4_000,
      limit: 10,
    });
    expect(dueConversations).toEqual([]);
  });

  it("atomically appends muted customer messages while extending the auto-resume deadline", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 1_000,
        lastCustomerMessageAt: 1_000,
        nextAutoResumeAt: 2_000,
      })
    );

    const updated = await t.mutation(internal.conversations.appendMutedCustomerMessage, {
      companyId,
      conversationId,
      content: "hello again",
      timestamp: 5_000,
    });

    expect(updated).toMatchObject({
      id: conversationId,
      muted: true,
      lastCustomerMessageAt: 5_000,
      nextAutoResumeAt: 5_000 + 12 * 60 * 60 * 1_000,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
    });
    expect(messages).toEqual([{
      id: expect.any(String),
      conversationId,
      role: "user",
      content: "hello again",
      timestamp: 5_000,
    }]);
  });

  it("does not resume a stale due auto-resume candidate after muted activity extends the deadline", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const conversationId = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 1_000,
        lastCustomerMessageAt: 1_000,
        nextAutoResumeAt: 2_000,
      })
    );

    const dueConversations = await t.query(internal.conversations.listDueAutoResumeConversations, {
      now: 2_000,
      limit: 10,
    });
    expect(dueConversations).toHaveLength(1);

    await t.mutation(internal.conversations.recordMutedCustomerActivity, {
      companyId,
      conversationId,
      timestamp: 5_000,
    });

    const resumed = await t.mutation(internal.conversations.resumeConversation, {
      companyId,
      conversationId,
      resumedAt: 2_000,
      source: "worker_auto",
    });

    expect(resumed).toMatchObject({
      id: conversationId,
      muted: true,
      mutedAt: 1_000,
      lastCustomerMessageAt: 5_000,
      nextAutoResumeAt: 5_000 + 12 * 60 * 60 * 1_000,
    });

    const stateEvents = await t.run(async (ctx) =>
      ctx.db.query("conversationStateEvents").collect()
    );
    expect(stateEvents).toHaveLength(0);
  });

  it("times out when the conversation lock remains held", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );
    const phoneNumber = "967700000001";
    const now = 1_000;

    await t.run(async (ctx) =>
      ctx.db.insert("jobLocks", {
        key: `conversation:${companyId}:${phoneNumber}`,
        ownerToken: "another-owner",
        acquiredAt: now,
        expiresAt: now + 60_000,
      })
    );

    await expect(
      t.action(internal.conversations.getOrCreateActiveConversation, {
        companyId,
        phoneNumber,
        now,
      }),
    ).rejects.toThrow(`Timeout acquiring conversation lock for companyId=${companyId} phoneNumber=${phoneNumber}`);
  });
});
