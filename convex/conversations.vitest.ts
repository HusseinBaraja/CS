import type { Id } from '@cs/db';
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { STALE_CONTEXT_RESET_MS } from './conversations';
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
      nextAutoResumeAt: 2_000 + 12 * 60 * 60 * 1_000,
    });
    expect(first.lastCustomerMessageAt).toBeUndefined();
    expect(second).toEqual(first);

    const stateEvents = await t.run(async (ctx) =>
      ctx.db.query("conversationStateEvents").collect()
    );
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]?.eventType).toBe("handoff_started");
    const storedConversation = await t.run(async (ctx) => ctx.db.get(conversationId));
    expect(storedConversation?.handoffSeedTimestamp).toBe(2_000);
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
      transportMessageId: "assistant-1",
    });

    expect(updated).toMatchObject({
      id: conversationId,
      muted: true,
      mutedAt: 2_000,
      nextAutoResumeAt: 2_000 + 12 * 60 * 60 * 1_000,
    });
    expect(updated.lastCustomerMessageAt).toBeUndefined();

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
      deliveryState: "sent",
      transportMessageId: "assistant-1",
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
    const storedConversation = await t.run(async (ctx) => ctx.db.get(conversationId));
    expect(storedConversation?.handoffSeedTimestamp).toBe(2_000);
  });

  it("creates pending assistant messages and commits them after send", async () => {
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

    const pending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "Assistant reply",
      timestamp: 2_000,
    });

    expect(pending).toMatchObject({
      conversationId,
      role: "assistant",
      content: "Assistant reply",
      timestamp: 2_000,
      deliveryState: "pending",
    });

    const acknowledged = await t.mutation(internal.conversations.acknowledgePendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
      acknowledgedAt: 2_050,
      transportMessageId: "assistant-1",
    });

    expect(acknowledged).toMatchObject({
      id: pending.id,
      deliveryState: "pending",
      providerAcknowledgedAt: 2_050,
      transportMessageId: "assistant-1",
      sideEffectsState: "pending",
      analyticsState: "not_applicable",
      ownerNotificationState: "not_applicable",
    });

    const committedConversation = await t.mutation(internal.conversations.commitPendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
      transportMessageId: "assistant-1",
    });

    expect(committedConversation).toMatchObject({
      id: conversationId,
      muted: false,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
    });
    expect(messages).toEqual([{
      id: pending.id,
      conversationId,
      role: "assistant",
      content: "Assistant reply",
      timestamp: 2_000,
      deliveryState: "sent",
      transportMessageId: "assistant-1",
    }]);
  });

  it("hides pending and failed assistant messages from recent history reads", async () => {
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

    const pending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "Pending assistant reply",
      timestamp: 2_000,
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "Customer message",
      timestamp: 2_100,
    });
    const visibleAssistant = await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "Visible assistant reply",
      timestamp: 2_200,
      transportMessageId: "assistant-visible-1",
    });

    const failed = await t.mutation(internal.conversations.markPendingAssistantMessageFailed, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
    });

    expect(failed).toMatchObject({
      id: pending.id,
      deliveryState: "failed",
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
    });
    expect(messages).toEqual([
      {
        id: expect.any(String),
        conversationId,
        role: "user",
        content: "Customer message",
        timestamp: 2_100,
      },
      {
        id: visibleAssistant.id,
        conversationId,
        role: "assistant",
        content: "Visible assistant reply",
        timestamp: 2_200,
        deliveryState: "sent",
        transportMessageId: "assistant-visible-1",
      },
    ]);
  });

  it("returns the requested count of visible recent messages when newer drafts are hidden", async () => {
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
      content: "visible-1",
      timestamp: 1_000,
      transportMessageId: "user-1",
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "visible-2",
      timestamp: 1_100,
      transportMessageId: "assistant-1",
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "visible-3",
      timestamp: 1_200,
      transportMessageId: "user-2",
    });
    const pending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "pending-hidden",
      timestamp: 1_300,
    });
    const failed = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "failed-hidden",
      timestamp: 1_400,
    });
    await t.mutation(internal.conversations.markPendingAssistantMessageFailed, {
      companyId,
      conversationId,
      pendingMessageId: failed.id as Id<"messages">,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId,
      limit: 2,
    });

    expect(messages).toEqual([
      {
        id: expect.any(String),
        conversationId,
        role: "assistant",
        content: "visible-2",
        timestamp: 1_100,
        deliveryState: "sent",
        transportMessageId: "assistant-1",
      },
      {
        id: expect.any(String),
        conversationId,
        role: "user",
        content: "visible-3",
        timestamp: 1_200,
        transportMessageId: "user-2",
      },
    ]);
    expect(pending.id).toBeDefined();
  });

  it("acknowledges pending handoff assistant messages idempotently", async () => {
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

    const pending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "Connecting you with the team.",
      timestamp: 2_000,
      source: "assistant_action",
    });

    const firstAcknowledgement = await t.mutation(internal.conversations.acknowledgePendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
      acknowledgedAt: 2_100,
      transportMessageId: "assistant-1",
    });
    const secondAcknowledgement = await t.mutation(internal.conversations.acknowledgePendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
      acknowledgedAt: 2_500,
      transportMessageId: "assistant-2",
    });

    expect(firstAcknowledgement).toMatchObject({
      id: pending.id,
      providerAcknowledgedAt: 2_100,
      transportMessageId: "assistant-1",
      sideEffectsState: "pending",
      analyticsState: "pending",
      ownerNotificationState: "pending",
    });
    expect(secondAcknowledgement).toEqual(firstAcknowledgement);
  });

  it("rejects acknowledging assistant messages that are already final", async () => {
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

    const sentMessage = await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "Already sent",
      timestamp: 2_000,
      transportMessageId: "assistant-sent-1",
    });
    const failedPending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "Will fail",
      timestamp: 2_500,
    });
    await t.mutation(internal.conversations.markPendingAssistantMessageFailed, {
      companyId,
      conversationId,
      pendingMessageId: failedPending.id as Id<"messages">,
    });

    await expect(t.mutation(internal.conversations.acknowledgePendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: sentMessage.id as Id<"messages">,
      acknowledgedAt: 3_000,
    })).rejects.toThrow("Only pending assistant messages can be acknowledged");
    await expect(t.mutation(internal.conversations.acknowledgePendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: failedPending.id as Id<"messages">,
      acknowledgedAt: 3_100,
    })).rejects.toThrow("Only pending assistant messages can be acknowledged");
  });

  it("commits pending handoff assistant messages once and rejects replays", async () => {
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

    const pending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "Connecting you with the team.",
      timestamp: 2_000,
      source: "assistant_action",
    });

    await t.mutation(internal.conversations.acknowledgePendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
      acknowledgedAt: 2_050,
      transportMessageId: "assistant-1",
    });

    const firstCommit = await t.mutation(internal.conversations.commitPendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
      transportMessageId: "assistant-1",
    });

    expect(firstCommit).toMatchObject({
      id: conversationId,
      muted: true,
      mutedAt: 2_000,
    });
    await expect(t.mutation(internal.conversations.commitPendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
      transportMessageId: "assistant-1",
    })).rejects.toThrow("Only pending assistant messages can be committed");

    const stateEvents = await t.run(async (ctx) =>
      ctx.db.query("conversationStateEvents").collect()
    );
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]?.eventType).toBe("handoff_started");
  });

  it("rejects committing pending assistant messages before acknowledgement", async () => {
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

    const pending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "Assistant reply",
      timestamp: 2_000,
    });

    await expect(t.mutation(internal.conversations.commitPendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: pending.id as Id<"messages">,
    })).rejects.toThrow("Pending assistant message must be acknowledged before commit");
  });

  it("rejects marking sent or acknowledged assistant messages failed", async () => {
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

    const sentMessage = await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "Already sent",
      timestamp: 2_000,
      transportMessageId: "assistant-sent-1",
    });
    const acknowledgedPending = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "Acknowledged pending",
      timestamp: 2_100,
    });
    await t.mutation(internal.conversations.acknowledgePendingAssistantMessage, {
      companyId,
      conversationId,
      pendingMessageId: acknowledgedPending.id as Id<"messages">,
      acknowledgedAt: 2_150,
      transportMessageId: "assistant-pending-1",
    });

    await expect(t.mutation(internal.conversations.markPendingAssistantMessageFailed, {
      companyId,
      conversationId,
      pendingMessageId: sentMessage.id as Id<"messages">,
    })).rejects.toThrow("Only pending assistant messages can be marked failed");
    await expect(t.mutation(internal.conversations.markPendingAssistantMessageFailed, {
      companyId,
      conversationId,
      pendingMessageId: acknowledgedPending.id as Id<"messages">,
    })).rejects.toThrow("Acknowledged assistant messages must be reconciled, not marked failed");
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
    const storedConversation = await t.run(async (ctx) => ctx.db.get(conversationId));
    expect(storedConversation?.handoffSeedTimestamp).toBeUndefined();

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

  it("atomically appends inbound customer messages for existing muted conversations", async () => {
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

    const result = await t.action(internal.conversations.appendInboundCustomerMessage, {
      companyId,
      phoneNumber: "967700000001",
      content: "hello again",
      timestamp: 5_000,
    });

    expect(result).toEqual({
      conversation: {
        id: conversationId,
        companyId,
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 1_000,
        lastCustomerMessageAt: 5_000,
        nextAutoResumeAt: 5_000 + 12 * 60 * 60 * 1_000,
      },
      wasMuted: true,
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

  it("atomically appends inbound customer messages while creating active conversations on demand", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );

    const result = await t.action(internal.conversations.appendInboundCustomerMessage, {
      companyId,
      phoneNumber: "967700000001",
      content: "hello",
      timestamp: 2_000,
    });

    expect(result.wasMuted).toBe(false);
    expect(result.conversation).toEqual({
      id: expect.any(String),
      companyId,
      phoneNumber: "967700000001",
      muted: false,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId: result.conversation.id as Id<"conversations">,
    });
    expect(messages).toEqual([{
      id: expect.any(String),
      conversationId: result.conversation.id,
      role: "user",
      content: "hello",
      timestamp: 2_000,
    }]);
  });

  it("persists inbound transport ids for quoted customer replies", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );

    const result = await t.action(internal.conversations.appendInboundCustomerMessage, {
      companyId,
      phoneNumber: "967700000001",
      content: "hello",
      timestamp: 2_000,
      transportMessageId: "inbound-1",
      referencedTransportMessageId: "quoted-1",
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId: result.conversation.id as Id<"conversations">,
    });
    expect(messages).toEqual([{
      id: expect.any(String),
      conversationId: result.conversation.id,
      role: "user",
      content: "hello",
      timestamp: 2_000,
      transportMessageId: "inbound-1",
      referencedTransportMessageId: "quoted-1",
    }]);
  });

  it("treats duplicate inbound transport ids as idempotent for active conversations", async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant A",
        ownerPhone: "966500000000",
      })
    );

    const first = await t.action(internal.conversations.appendInboundCustomerMessage, {
      companyId,
      phoneNumber: "967700000001",
      content: "hello",
      timestamp: 2_000,
      transportMessageId: "inbound-1",
    });
    const second = await t.action(internal.conversations.appendInboundCustomerMessage, {
      companyId,
      phoneNumber: "967700000001",
      content: "hello again",
      timestamp: 9_000,
      transportMessageId: "inbound-1",
    });

    expect(second).toEqual({
      conversation: first.conversation,
      wasMuted: false,
      wasDuplicate: true,
    });

    const messages = await t.query(internal.conversations.listConversationMessages, {
      companyId,
      conversationId: first.conversation.id as Id<"conversations">,
    });
    expect(messages).toEqual([{
      id: expect.any(String),
      conversationId: first.conversation.id,
      role: "user",
      content: "hello",
      timestamp: 2_000,
      transportMessageId: "inbound-1",
    }]);
  });

  it("treats duplicate muted inbound transport ids as idempotent without extending deadlines", async () => {
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

    const first = await t.mutation(internal.conversations.appendMutedCustomerMessage, {
      companyId,
      conversationId,
      content: "hello again",
      timestamp: 5_000,
      transportMessageId: "inbound-1",
    });
    const second = await t.mutation(internal.conversations.appendMutedCustomerMessage, {
      companyId,
      conversationId,
      content: "duplicate delivery",
      timestamp: 9_000,
      transportMessageId: "inbound-1",
    });

    expect(first).toMatchObject({
      id: conversationId,
      muted: true,
      lastCustomerMessageAt: 5_000,
      nextAutoResumeAt: 5_000 + 12 * 60 * 60 * 1_000,
    });
    expect(second).toMatchObject({
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
      transportMessageId: "inbound-1",
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

  it("returns recent prompt history when the latest message is within the active window", async () => {
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

    for (let index = 1; index <= 3; index += 1) {
      await t.mutation(internal.conversations.appendConversationMessage, {
        companyId,
        conversationId,
        role: index % 2 === 0 ? "assistant" : "user",
        content: `message-${index}`,
        timestamp: 1_000 + index,
        transportMessageId: `transport-${index}`,
      });
    }

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "current inbound",
      timestamp: 1_000 + STALE_CONTEXT_RESET_MS,
      transportMessageId: "inbound-1",
    });

    const history = await t.query(internal.conversations.getPromptHistoryForInbound, {
      companyId,
      conversationId,
      inboundTimestamp: 1_000 + STALE_CONTEXT_RESET_MS,
      currentTransportMessageId: "inbound-1",
      limit: 20,
    });

    expect(history).toEqual([
      { role: "user", text: "message-1" },
      { role: "assistant", text: "message-2" },
      { role: "user", text: "message-3" },
    ]);
  });

  it("excludes pending and failed assistant rows from inbound prompt history", async () => {
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
      content: "hello",
      timestamp: 1_000,
      transportMessageId: "user-1",
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "assistant",
      content: "sent reply",
      timestamp: 1_100,
      transportMessageId: "assistant-sent-1",
    });
    await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "pending reply",
      timestamp: 1_150,
    });
    const failed = await t.mutation(internal.conversations.appendPendingAssistantMessage, {
      companyId,
      conversationId,
      content: "failed reply",
      timestamp: 1_175,
    });
    await t.mutation(internal.conversations.markPendingAssistantMessageFailed, {
      companyId,
      conversationId,
      pendingMessageId: failed.id as Id<"messages">,
    });

    const history = await t.query(internal.conversations.getPromptHistoryForInbound, {
      companyId,
      conversationId,
      inboundTimestamp: 1_200,
      currentTransportMessageId: "inbound-1",
      limit: 10,
    });

    expect(history).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "sent reply" },
    ]);
  });

  it("returns empty prompt history when the latest message is stale and no reference exists", async () => {
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
      content: "old message",
      timestamp: 1_000,
      transportMessageId: "old-1",
    });

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "current inbound",
      timestamp: 1_000 + STALE_CONTEXT_RESET_MS + 1,
      transportMessageId: "inbound-1",
    });

    const history = await t.query(internal.conversations.getPromptHistoryForInbound, {
      companyId,
      conversationId,
      inboundTimestamp: 1_000 + STALE_CONTEXT_RESET_MS + 1,
      currentTransportMessageId: "inbound-1",
      limit: 20,
    });

    expect(history).toEqual([]);
  });

  it("returns an 11-message slice around a referenced stale message", async () => {
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

    for (let index = 1; index <= 15; index += 1) {
      await t.mutation(internal.conversations.appendConversationMessage, {
        companyId,
        conversationId,
        role: index % 2 === 0 ? "assistant" : "user",
        content: `message-${index}`,
        timestamp: index * 1_000,
        transportMessageId: `transport-${index}`,
      });
    }

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "current inbound",
      timestamp: STALE_CONTEXT_RESET_MS + 20_000,
      transportMessageId: "inbound-1",
    });

    const history = await t.query(internal.conversations.getPromptHistoryForInbound, {
      companyId,
      conversationId,
      inboundTimestamp: STALE_CONTEXT_RESET_MS + 20_000,
      currentTransportMessageId: "inbound-1",
      referencedTransportMessageId: "transport-8",
      limit: 20,
    });

    expect(history).toEqual([
      { role: "user", text: "message-3" },
      { role: "assistant", text: "message-4" },
      { role: "user", text: "message-5" },
      { role: "assistant", text: "message-6" },
      { role: "user", text: "message-7" },
      { role: "assistant", text: "message-8" },
      { role: "user", text: "message-9" },
      { role: "assistant", text: "message-10" },
      { role: "user", text: "message-11" },
      { role: "assistant", text: "message-12" },
      { role: "user", text: "message-13" },
    ]);
  });

  it("keeps same-timestamp prior messages while excluding the current inbound transport id", async () => {
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
      content: "same timestamp prior",
      timestamp: 5_000,
      transportMessageId: "assistant-5",
    });
    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId,
      conversationId,
      role: "user",
      content: "current inbound",
      timestamp: 5_000,
      transportMessageId: "inbound-1",
    });

    const history = await t.query(internal.conversations.getPromptHistoryForInbound, {
      companyId,
      conversationId,
      inboundTimestamp: 5_000,
      currentTransportMessageId: "inbound-1",
      limit: 20,
    });

    expect(history).toEqual([
      { role: "assistant", text: "same timestamp prior" },
    ]);
  });

  it("does not resolve referenced messages across tenants", async () => {
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
    const conversationA = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId: companyA,
        phoneNumber: "967700000001",
        muted: false,
      })
    );
    const conversationB = await t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        companyId: companyB,
        phoneNumber: "967700000001",
        muted: false,
      })
    );

    await t.mutation(internal.conversations.appendConversationMessage, {
      companyId: companyB,
      conversationId: conversationB,
      role: "assistant",
      content: "other tenant message",
      timestamp: 1_000,
      transportMessageId: "shared-reference",
    });

    const history = await t.query(internal.conversations.getPromptHistoryForInbound, {
      companyId: companyA,
      conversationId: conversationA,
      inboundTimestamp: STALE_CONTEXT_RESET_MS + 2_000,
      currentTransportMessageId: "inbound-1",
      referencedTransportMessageId: "shared-reference",
      limit: 20,
    });

    expect(history).toEqual([]);
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
