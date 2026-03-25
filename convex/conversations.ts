import { v } from 'convex/values';
import type { PromptHistoryTurn } from '@cs/ai';
import type {
  ConversationMessageDto,
  ConversationStateDto,
  ConversationStateEventSource,
  ConversationStateEventType,
} from '@cs/shared';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type DatabaseReader,
  type MutationCtx,
} from './_generated/server';

const CONVERSATION_LOCK_LEASE_MS = 1_000;
const CONVERSATION_LOCK_POLL_MS = 100;
const MAX_CONVERSATION_LOCK_WAIT_MS = 1_500;
const TRIM_MESSAGES_BATCH_SIZE = 100;
export const AUTO_RESUME_IDLE_MS = 12 * 60 * 60 * 1_000;

type LockAcquireResult = {
  acquired: boolean;
  waitMs: number;
};

type TrimConversationMessagesResult = {
  deletedCount: number;
  remainingCount: number;
};

type AppendInboundCustomerMessageResult = {
  conversation: ConversationStateDto;
  wasMuted: boolean;
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

const toConversationDto = (conversation: Doc<"conversations">): ConversationStateDto => ({
  id: conversation._id,
  companyId: conversation.companyId,
  phoneNumber: conversation.phoneNumber,
  muted: conversation.muted,
  ...(conversation.mutedAt !== undefined ? { mutedAt: conversation.mutedAt } : {}),
  ...(conversation.lastCustomerMessageAt !== undefined
    ? { lastCustomerMessageAt: conversation.lastCustomerMessageAt }
    : {}),
  ...(conversation.nextAutoResumeAt !== undefined ? { nextAutoResumeAt: conversation.nextAutoResumeAt } : {}),
});

const toMessageDto = (message: Doc<"messages">): ConversationMessageDto => ({
  id: message._id,
  conversationId: message.conversationId,
  role: message.role,
  content: message.content,
  timestamp: message.timestamp,
});

const toPromptHistoryTurn = (message: ConversationMessageDto): PromptHistoryTurn => ({
  role: message.role,
  text: message.content,
});

const normalizeOptionalString = (value: string | undefined, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string when provided`);
  }

  return normalized;
};

const listConversationsByPhone = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  phoneNumber: string,
): Promise<Array<Doc<"conversations">>> => {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_company_phone", (q) => q.eq("companyId", companyId).eq("phoneNumber", phoneNumber))
    .collect();

  return conversations.sort((left, right) => left._creationTime - right._creationTime || left._id.localeCompare(right._id));
};

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

const loadConversationByPhone = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  phoneNumber: string,
): Promise<Doc<"conversations"> | null> => {
  const conversations = await listConversationsByPhone(ctx, companyId, phoneNumber);
  return conversations[0] ?? null;
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

const insertConversationStateEvent = async (
  ctx: MutationCtx,
  input: {
    companyId: Id<"companies">;
    conversationId: Id<"conversations">;
    phoneNumber: string;
    eventType: ConversationStateEventType;
    timestamp: number;
    source: ConversationStateEventSource;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  },
): Promise<void> => {
  await ctx.db.insert("conversationStateEvents", {
    companyId: input.companyId,
    conversationId: input.conversationId,
    phoneNumber: input.phoneNumber,
    eventType: input.eventType,
    timestamp: input.timestamp,
    source: input.source,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.actorPhoneNumber ? { actorPhoneNumber: input.actorPhoneNumber } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
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

const withConversationLock = async <T>(
  ctx: ActionCtx,
  input: {
    companyId: Id<"companies">;
    phoneNumber: string;
    now?: number;
  },
  work: () => Promise<T>,
): Promise<T> => {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const ownerToken = crypto.randomUUID();
  const key = getConversationLockKey(input.companyId, phoneNumber);
  const startedAt = normalizeTimestamp(input.now, Date.now());
  const deadline = startedAt + MAX_CONVERSATION_LOCK_WAIT_MS;
  let currentNow = startedAt;

  for (;;) {
    const acquisitionNow =
      input.now === undefined ? normalizeTimestamp(undefined, Date.now()) : currentNow;
    const acquisition = await ctx.runMutation(internal.conversations.acquireConversationLock, {
      key,
      now: acquisitionNow,
      ownerToken,
    });

    if (acquisition.acquired) {
      break;
    }

    const sleepMs = Math.min(acquisition.waitMs, CONVERSATION_LOCK_POLL_MS);
    const deadlineNow =
      input.now === undefined ? normalizeTimestamp(undefined, Date.now()) : currentNow;
    if (deadlineNow + sleepMs > deadline) {
      throw new Error(
        `Timeout acquiring conversation lock for companyId=${input.companyId} phoneNumber=${phoneNumber}`,
      );
    }

    if (input.now !== undefined) {
      currentNow += sleepMs;
    }
    await sleep(sleepMs);
  }

  try {
    return await work();
  } finally {
    await ctx.runMutation(internal.conversations.releaseConversationLock, {
      key,
      ownerToken,
    });
  }
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
  handler: async (ctx, args): Promise<ConversationStateDto> => {
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
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    return withConversationLock(ctx, args, async () => {
      return await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });
    });
  },
});

export const getOrCreateConversationForInbound = internalAction({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    return withConversationLock(ctx, args, async () => {
      const existing = await ctx.runQuery(internal.conversations.getConversationByPhone, {
        companyId: args.companyId,
        phoneNumber,
      });
      if (existing) {
        return existing;
      }

      return await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });
    });
  },
});

export const getConversationByPhone = internalQuery({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args): Promise<ConversationStateDto | null> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    const conversation = await loadConversationByPhone(ctx, args.companyId, phoneNumber);
    return conversation ? toConversationDto(conversation) : null;
  },
});

export const getConversation = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(conversation);
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
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
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

export const appendMutedCustomerMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      throw new Error("Conversation is not muted");
    }

    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content,
      timestamp,
    });

    await ctx.db.patch(conversation._id, {
      lastCustomerMessageAt: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const appendInboundCustomerMessageToConversation = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<AppendInboundCustomerMessageResult> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content,
      timestamp,
    });

    if (!conversation.muted) {
      return {
        conversation: toConversationDto(conversation),
        wasMuted: false,
      };
    }

    await ctx.db.patch(conversation._id, {
      lastCustomerMessageAt: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return {
      conversation: toConversationDto(updatedConversation),
      wasMuted: true,
    };
  },
});

export const appendInboundCustomerMessage = internalAction({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
    content: v.string(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<AppendInboundCustomerMessageResult> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    return withConversationLock(ctx, args, async () => {
      const existing = await ctx.runQuery(internal.conversations.getConversationByPhone, {
        companyId: args.companyId,
        phoneNumber,
      });
      const conversation = existing ?? await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });

      return ctx.runMutation(internal.conversations.appendInboundCustomerMessageToConversation, {
        companyId: args.companyId,
        conversationId: conversation.id as Id<"conversations">,
        content: args.content,
        timestamp: args.timestamp,
      });
    });
  },
});

export const appendAssistantMessageAndStartHandoff = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
    source: v.union(
      v.literal("assistant_action"),
      v.literal("provider_failure_fallback"),
      v.literal("invalid_model_output_fallback"),
    ),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (conversation.muted) {
      return toConversationDto(conversation);
    }

    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content,
      timestamp,
    });

    await ctx.db.patch(conversation._id, {
      muted: true,
      mutedAt: timestamp,
      handoffSeedTimestamp: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    await insertConversationStateEvent(ctx, {
      companyId: args.companyId,
      conversationId: conversation._id,
      phoneNumber: conversation.phoneNumber,
      eventType: "handoff_started",
      timestamp,
      source: args.source,
      ...(reason ? { reason } : {}),
      ...(actorPhoneNumber ? { actorPhoneNumber } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const listConversationMessages = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto[]> => {
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

export const listDueAutoResumeConversations = internalQuery({
  args: {
    now: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<ConversationStateDto[]> => {
    const now = normalizeTimestamp(args.now, Date.now());
    const limit = normalizePositiveInteger(args.limit, "limit");
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_muted_next_auto_resume_at", (q) => q.eq("muted", true).lte("nextAutoResumeAt", now))
      .take(limit);

    return conversations.map(toConversationDto);
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
    let cursor: string | null = null;
    let totalMessages = 0;
    const idsToDelete: Array<Id<"messages">> = [];
    const retainedIds: Array<Id<"messages">> = [];

    for (;;) {
      const page = await ctx.db
        .query("messages")
        .withIndex("by_conversation_time", (q) => q.eq("conversationId", args.conversationId))
        .paginate({
          cursor,
          numItems: TRIM_MESSAGES_BATCH_SIZE,
        });

      totalMessages += page.page.length;
      for (const message of page.page) {
        retainedIds.push(message._id);
        if (retainedIds.length > maxMessages) {
          const oldestRetainedId = retainedIds.shift();
          if (oldestRetainedId) {
            idsToDelete.push(oldestRetainedId);
          }
        }
      }

      if (page.isDone || page.page.length === 0) {
        break;
      }

      cursor = page.continueCursor;
    }

    const excessCount = Math.max(totalMessages - maxMessages, 0);
    if (excessCount === 0) {
      return {
        deletedCount: 0,
        remainingCount: totalMessages,
      };
    }

    let deletedCount = 0;
    while (deletedCount < excessCount) {
      const batchIds = idsToDelete.slice(deletedCount, deletedCount + TRIM_MESSAGES_BATCH_SIZE);
      for (const messageId of batchIds) {
        await ctx.db.delete(messageId);
        deletedCount += 1;
      }
    }

    return {
      deletedCount,
      remainingCount: totalMessages - deletedCount,
    };
  },
});

export const startHandoff = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    triggerTimestamp: v.optional(v.number()),
    source: v.union(
      v.literal("assistant_action"),
      v.literal("provider_failure_fallback"),
      v.literal("invalid_model_output_fallback"),
      v.literal("api_manual"),
    ),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (conversation.muted) {
      return toConversationDto(conversation);
    }

    const triggerTimestamp = normalizeTimestamp(args.triggerTimestamp, Date.now());
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");

    await ctx.db.patch(conversation._id, {
      muted: true,
      mutedAt: triggerTimestamp,
      handoffSeedTimestamp: triggerTimestamp,
      nextAutoResumeAt: triggerTimestamp + AUTO_RESUME_IDLE_MS,
    });

    await insertConversationStateEvent(ctx, {
      companyId: args.companyId,
      conversationId: conversation._id,
      phoneNumber: conversation.phoneNumber,
      eventType: "handoff_started",
      timestamp: triggerTimestamp,
      source: args.source,
      ...(reason ? { reason } : {}),
      ...(actorPhoneNumber ? { actorPhoneNumber } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const resumeConversation = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    resumedAt: v.optional(v.number()),
    source: v.union(v.literal("api_manual"), v.literal("worker_auto")),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      return toConversationDto(conversation);
    }

    const resumedAt = normalizeTimestamp(args.resumedAt, Date.now());
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");

    if (
      conversation.nextAutoResumeAt === undefined
      || conversation.nextAutoResumeAt > resumedAt
    ) {
      return toConversationDto(conversation);
    }

    await ctx.db.patch(conversation._id, {
      muted: false,
      mutedAt: undefined,
      handoffSeedTimestamp: undefined,
      nextAutoResumeAt: undefined,
    });

    await insertConversationStateEvent(ctx, {
      companyId: args.companyId,
      conversationId: conversation._id,
      phoneNumber: conversation.phoneNumber,
      eventType: args.source === "api_manual" ? "handoff_resumed_manual" : "handoff_resumed_auto",
      timestamp: resumedAt,
      source: args.source,
      ...(reason ? { reason } : {}),
      ...(actorPhoneNumber ? { actorPhoneNumber } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const recordMutedCustomerActivity = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      throw new Error("Conversation is not muted");
    }

    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    await ctx.db.patch(conversation._id, {
      lastCustomerMessageAt: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});
