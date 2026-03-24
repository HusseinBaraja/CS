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
});
