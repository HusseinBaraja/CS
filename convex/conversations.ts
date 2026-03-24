import { v } from 'convex/values';
import type { PromptHistoryTurn } from '@cs/ai';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, type DatabaseReader, type MutationCtx } from './_generated/server';

const CONVERSATION_LOCK_LEASE_MS = 5_000;
const CONVERSATION_LOCK_POLL_MS = 100;

type ConversationDto = {
  id: string;
  companyId: string;
  phoneNumber: string;
  muted: boolean;
  mutedAt?: number;
};

type MessageRole = "user" | "assistant";

type MessageDto = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
};

type LockAcquireResult = {
  acquired: boolean;
  waitMs: number;
};

type TrimConversationMessagesResult = {
  deletedCount: number;
  remainingCount: number;
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const getConversationLockKey = (companyId: Id<"companies">, phoneNumber: string): string =>
  `conversation:${companyId}:${phoneNumber}`;

const normalizePhoneNumber = (phoneNumber: string): string => {
  const normalized = phoneNumber.trim();
  if (normalized.length === 0) {
    throw new Error("phoneNumber is required");
  }

  return normalized;
};

const normalizeTimestamp = (timestamp: number | undefined, fallback: number): number => {
  const candidate = timestamp ?? fallback;
  if (!Number.isFinite(candidate)) {
    throw new Error("timestamp must be a finite number");
  }

  return Math.trunc(candidate);
};

const normalizePositiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return normalized;
};

const normalizeOptionalLimit = (limit: number | undefined): number | undefined =>
  limit === undefined ? undefined : normalizePositiveInteger(limit, "limit");

const normalizeMessageContent = (content: string): string => {
  const normalized = content.trim();
  if (normalized.length === 0) {
    throw new Error("content must be a non-empty string");
  }

  return normalized;
};

const toConversationDto = (conversation: Doc<"conversations">): ConversationDto => ({
  id: conversation._id,
  companyId: conversation.companyId,
  phoneNumber: conversation.phoneNumber,
  muted: conversation.muted,
  ...(conversation.mutedAt !== undefined ? { mutedAt: conversation.mutedAt } : {}),
});

const toMessageDto = (message: Doc<"messages">): MessageDto => ({
  id: message._id,
  conversationId: message.conversationId,
  role: message.role,
  content: message.content,
  timestamp: message.timestamp,
});

const toPromptHistoryTurn = (message: MessageDto): PromptHistoryTurn => ({
  role: message.role,
  text: message.content,
});

const listActiveConversations = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  phoneNumber: string,
): Promise<Array<Doc<"conversations">>> => {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_company_phone_and_muted", (q) =>
      q.eq("companyId", companyId).eq("phoneNumber", phoneNumber).eq("muted", false)
    )
    .collect();

  return conversations.sort((left, right) => left._creationTime - right._creationTime || left._id.localeCompare(right._id));
};

const loadConversationOrThrow = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  conversationId: Id<"conversations">,
): Promise<Doc<"conversations">> => {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.companyId !== companyId) {
    throw new Error("Conversation not found for company");
  }

  return conversation;
};

const loadConversationLock = async (
  ctx: MutationCtx,
  key: string,
): Promise<Doc<"jobLocks"> | null> => {
  const locks = await ctx.db
    .query("jobLocks")
    .withIndex("by_key", (q) => q.eq("key", key))
    .collect();

  if (locks.length > 1) {
    throw new Error(`Expected at most one ${key} lock, found ${locks.length}`);
  }

  return locks[0] ?? null;
};

const extendConversationLock = async (
  ctx: MutationCtx,
  lockId: Id<"jobLocks">,
  ownerToken: string,
  now: number,
): Promise<void> => {
  await ctx.db.patch(lockId, {
    ownerToken,
    acquiredAt: now,
    expiresAt: now + CONVERSATION_LOCK_LEASE_MS,
  });
};

export const acquireConversationLock = internalMutation({
  args: {
    key: v.string(),
    now: v.number(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<LockAcquireResult> => {
    const existingLock = await loadConversationLock(ctx, args.key);
    if (!existingLock) {
      await ctx.db.insert("jobLocks", {
        key: args.key,
        ownerToken: args.ownerToken,
        acquiredAt: args.now,
        expiresAt: args.now + CONVERSATION_LOCK_LEASE_MS,
      });

      return {
        acquired: true,
        waitMs: 0,
      };
    }

    if (existingLock.ownerToken === args.ownerToken || existingLock.expiresAt <= args.now) {
      await extendConversationLock(ctx, existingLock._id, args.ownerToken, args.now);
      return {
        acquired: true,
        waitMs: 0,
      };
    }

    return {
      acquired: false,
      waitMs: Math.max(existingLock.expiresAt - args.now, CONVERSATION_LOCK_POLL_MS),
    };
  },
});

export const releaseConversationLock = internalMutation({
  args: {
    key: v.string(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existingLock = await loadConversationLock(ctx, args.key);
    if (!existingLock || existingLock.ownerToken !== args.ownerToken) {
      return;
    }

    await ctx.db.delete(existingLock._id);
  },
});

export const ensureActiveConversation = internalMutation({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args): Promise<ConversationDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    const existing = await listActiveConversations(ctx, args.companyId, phoneNumber);
    if (existing[0]) {
      return toConversationDto(existing[0]);
    }

    const conversationId = await ctx.db.insert("conversations", {
      companyId: args.companyId,
      phoneNumber,
      muted: false,
    });
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      throw new Error("Created conversation could not be loaded");
    }

    return toConversationDto(conversation);
  },
});

export const getOrCreateActiveConversation = internalAction({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    const ownerToken = crypto.randomUUID();
    const key = getConversationLockKey(args.companyId, phoneNumber);

    for (;;) {
      const acquisition = await ctx.runMutation(internal.conversations.acquireConversationLock, {
        key,
        now: normalizeTimestamp(args.now, Date.now()),
        ownerToken,
      });

      if (acquisition.acquired) {
        break;
      }

      await sleep(Math.min(acquisition.waitMs, CONVERSATION_LOCK_POLL_MS));
    }

    try {
      return await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });
    } finally {
      await ctx.runMutation(internal.conversations.releaseConversationLock, {
        key,
        ownerToken,
      });
    }
  },
});

export const appendConversationMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content,
      timestamp,
    });
    const message = await ctx.db.get(messageId);
    if (!message) {
      throw new Error("Created message could not be loaded");
    }

    return toMessageDto(message);
  },
});

export const listConversationMessages = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MessageDto[]> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const limit = normalizeOptionalLimit(args.limit);

    if (limit !== undefined) {
      const latestMessages = await ctx.db
        .query("messages")
        .withIndex("by_conversation_time", (q) => q.eq("conversationId", args.conversationId))
        .order("desc")
        .take(limit);

      return latestMessages.reverse().map(toMessageDto);
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_time", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
    return messages.map(toMessageDto);
  },
});

export const getPromptHistory = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<PromptHistoryTurn[]> => {
    const messages = await ctx.runQuery(internal.conversations.listConversationMessages, {
      companyId: args.companyId,
      conversationId: args.conversationId,
      limit: normalizePositiveInteger(args.limit, "limit"),
    });

    return messages.map(toPromptHistoryTurn);
  },
});

export const trimConversationMessages = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    maxMessages: v.number(),
  },
  handler: async (ctx, args): Promise<TrimConversationMessagesResult> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const maxMessages = normalizePositiveInteger(args.maxMessages, "maxMessages");
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_time", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();

    const excessCount = Math.max(messages.length - maxMessages, 0);
    if (excessCount === 0) {
      return {
        deletedCount: 0,
        remainingCount: messages.length,
      };
    }

    for (const message of messages.slice(0, excessCount)) {
      await ctx.db.delete(message._id);
    }

    return {
      deletedCount: excessCount,
      remainingCount: messages.length - excessCount,
    };
  },
});
