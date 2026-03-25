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
const PROMPT_HISTORY_SCAN_BATCH_SIZE = 100;
export const AUTO_RESUME_IDLE_MS = 12 * 60 * 60 * 1_000;
export const STALE_CONTEXT_RESET_MS = 30 * 60 * 1_000;
const REFERENCED_HISTORY_SIDE_MESSAGES = 5;

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

type AssistantHandoffSource = Extract<
  ConversationStateEventSource,
  "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback"
>;

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

const normalizeOptionalMessageId = (
  value: string | undefined,
  fieldName: string,
): string | undefined => normalizeOptionalString(value, fieldName);

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
  ...(message.deliveryState !== undefined ? { deliveryState: message.deliveryState } : {}),
  ...(message.transportMessageId !== undefined ? { transportMessageId: message.transportMessageId } : {}),
  ...(message.referencedTransportMessageId !== undefined
    ? { referencedTransportMessageId: message.referencedTransportMessageId }
    : {}),
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

const isVisibleConversationMessage = (message: Pick<Doc<"messages">, "deliveryState">): boolean =>
  message.deliveryState !== "failed";

const listConversationMessageDocs = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
): Promise<Array<Doc<"messages">>> =>
  ctx.db
    .query("messages")
    .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
    .order("asc")
    .collect();

const listConversationMessageDocsPage = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  input: {
    cursor: string | null;
    limit: number;
  },
) =>
  ctx.db
    .query("messages")
    .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .paginate({
      cursor: input.cursor,
      numItems: input.limit,
    });

const resolveMessageByTransportMessageId = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  transportMessageId: string,
): Promise<Doc<"messages"> | null> => {
  const normalizedTransportMessageId = normalizeOptionalMessageId(transportMessageId, "transportMessageId");
  if (!normalizedTransportMessageId) {
    return null;
  }

  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_transport_message_id", (q) =>
      q.eq("conversationId", conversationId).eq("transportMessageId", normalizedTransportMessageId)
    )
    .collect();

  return messages[0] ?? null;
};

const resolveExistingMessageInsert = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  transportMessageId: string | undefined,
): Promise<Doc<"messages"> | null> => {
  if (!transportMessageId) {
    return null;
  }

  return resolveMessageByTransportMessageId(ctx, conversationId, transportMessageId);
};

const filterMessagesBeforeInbound = (
  messages: ConversationMessageDto[],
  input: {
    inboundTimestamp: number;
    currentTransportMessageId?: string;
  },
): ConversationMessageDto[] =>
  messages.filter((message) => {
    if (message.deliveryState === "failed") {
      return false;
    }

    if (message.timestamp < input.inboundTimestamp) {
      return true;
    }

    if (message.timestamp === input.inboundTimestamp) {
      return message.transportMessageId !== input.currentTransportMessageId;
    }

    if (message.timestamp > input.inboundTimestamp) {
      return false;
    }

    return false;
  });

const collectPriorMessagesDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  input: {
    inboundTimestamp: number;
    currentTransportMessageId?: string;
    minimumCount?: number;
    stopWhenPriorMessagesFound?: boolean;
  },
): Promise<ConversationMessageDto[]> => {
  const priorMessages: ConversationMessageDto[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page = await listConversationMessageDocsPage(ctx, conversationId, {
      cursor,
      limit: PROMPT_HISTORY_SCAN_BATCH_SIZE,
    });
    const filteredPage = filterMessagesBeforeInbound(
      page.page.map(toMessageDto),
      input,
    );
    priorMessages.push(...filteredPage);

    if (
      input.stopWhenPriorMessagesFound
      && priorMessages.length > 0
    ) {
      break;
    }

    if (
      input.minimumCount !== undefined
      && priorMessages.length >= input.minimumCount
    ) {
      break;
    }

    if (page.isDone || page.page.length === 0) {
      break;
    }

    cursor = page.continueCursor;
  }

  return priorMessages;
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

const loadMessageOrThrow = async (
  ctx: { db: DatabaseReader },
  messageId: Id<"messages">,
): Promise<Doc<"messages">> => {
  const message = await ctx.db.get(messageId);
  if (!message) {
    throw new Error("Message not found");
  }

  return message;
};

const normalizeOptionalHandoffSource = (
  value: AssistantHandoffSource | undefined,
): AssistantHandoffSource | undefined => value;

const applyAssistantHandoffIfNeeded = async (
  ctx: MutationCtx,
  input: {
    companyId: Id<"companies">;
    conversation: Doc<"conversations">;
    message: Doc<"messages">;
  },
): Promise<void> => {
  const source = input.message.handoffSource;
  if (!source || input.conversation.muted) {
    return;
  }

  await ctx.db.patch(input.conversation._id, {
    muted: true,
    mutedAt: input.message.timestamp,
    handoffSeedTimestamp: input.message.timestamp,
    nextAutoResumeAt: input.message.timestamp + AUTO_RESUME_IDLE_MS,
  });

  await insertConversationStateEvent(ctx, {
    companyId: input.companyId,
    conversationId: input.conversation._id,
    phoneNumber: input.conversation.phoneNumber,
    eventType: "handoff_started",
    timestamp: input.message.timestamp,
    source,
    ...(input.message.handoffReason ? { reason: input.message.handoffReason } : {}),
    ...(input.message.handoffActorPhoneNumber ? { actorPhoneNumber: input.message.handoffActorPhoneNumber } : {}),
    ...(input.message.handoffMetadata ? { metadata: input.message.handoffMetadata } : {}),
  });
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
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content,
      timestamp,
      ...(args.role === "assistant" ? { deliveryState: "sent" as const } : {}),
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
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
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      throw new Error("Conversation is not muted");
    }

    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );
    const existingMessage = await resolveExistingMessageInsert(ctx, args.conversationId, transportMessageId);
    if (existingMessage) {
      return toConversationDto(conversation);
    }

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content,
      timestamp,
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
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
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AppendInboundCustomerMessageResult> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );
    const existingMessage = await resolveExistingMessageInsert(ctx, args.conversationId, transportMessageId);
    if (existingMessage) {
      return {
        conversation: toConversationDto(conversation),
        wasMuted: conversation.muted,
      };
    }

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content,
      timestamp,
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
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
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
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
        transportMessageId: args.transportMessageId,
        referencedTransportMessageId: args.referencedTransportMessageId,
      });
    });
  },
});

export const appendPendingAssistantMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
    source: v.optional(v.union(
      v.literal("assistant_action"),
      v.literal("provider_failure_fallback"),
      v.literal("invalid_model_output_fallback"),
    )),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const source = normalizeOptionalHandoffSource(args.source);
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content,
      timestamp,
      deliveryState: "pending",
      ...(source ? { handoffSource: source } : {}),
      ...(reason ? { handoffReason: reason } : {}),
      ...(actorPhoneNumber ? { handoffActorPhoneNumber: actorPhoneNumber } : {}),
      ...(args.metadata ? { handoffMetadata: args.metadata } : {}),
    });
    return toMessageDto(await loadMessageOrThrow(ctx, messageId));
  },
});

export const commitPendingAssistantMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    pendingMessageId: v.id("messages"),
    transportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== "assistant") {
      throw new Error("Pending assistant message not found for conversation");
    }

    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    if (message.deliveryState !== "sent") {
      await ctx.db.patch(message._id, {
        deliveryState: "sent",
        ...(transportMessageId ? { transportMessageId } : {}),
      });
    }

    const updatedMessage = await loadMessageOrThrow(ctx, args.pendingMessageId);
    await applyAssistantHandoffIfNeeded(ctx, {
      companyId: args.companyId,
      conversation,
      message: updatedMessage,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const markPendingAssistantMessageFailed = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    pendingMessageId: v.id("messages"),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== "assistant") {
      throw new Error("Pending assistant message not found for conversation");
    }

    if (message.deliveryState !== "sent") {
      await ctx.db.patch(message._id, {
        deliveryState: "failed",
      });
    }

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
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
    transportMessageId: v.optional(v.string()),
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
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content,
      timestamp,
      deliveryState: "sent",
      handoffSource: args.source,
      ...(reason ? { handoffReason: reason } : {}),
      ...(actorPhoneNumber ? { handoffActorPhoneNumber: actorPhoneNumber } : {}),
      ...(args.metadata ? { handoffMetadata: args.metadata } : {}),
      ...(transportMessageId ? { transportMessageId } : {}),
    });
    const message = await loadMessageOrThrow(ctx, messageId);
    await applyAssistantHandoffIfNeeded(ctx, {
      companyId: args.companyId,
      conversation,
      message,
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

      return latestMessages
        .filter(isVisibleConversationMessage)
        .reverse()
        .map(toMessageDto);
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_time", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
    return messages.filter(isVisibleConversationMessage).map(toMessageDto);
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

export const getPromptHistoryForInbound = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    inboundTimestamp: v.number(),
    currentTransportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<PromptHistoryTurn[]> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const inboundTimestamp = normalizeTimestamp(args.inboundTimestamp, Date.now());
    const limit = normalizePositiveInteger(args.limit, "limit");
    const currentTransportMessageId = normalizeOptionalMessageId(
      args.currentTransportMessageId,
      "currentTransportMessageId",
    );
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );

    const priorMessagesDescending = await collectPriorMessagesDescending(ctx, args.conversationId, {
      inboundTimestamp,
      ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
      stopWhenPriorMessagesFound: true,
    });

    if (priorMessagesDescending.length === 0) {
      return [];
    }

    const latestMessage = priorMessagesDescending[0];
    const activeWindowStart = inboundTimestamp - STALE_CONTEXT_RESET_MS;
    if (latestMessage && latestMessage.timestamp >= activeWindowStart) {
      const recentPriorMessages = await collectPriorMessagesDescending(ctx, args.conversationId, {
        inboundTimestamp,
        ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
        minimumCount: limit,
      });
      return recentPriorMessages.slice(0, limit).reverse().map(toPromptHistoryTurn);
    }

    if (!referencedTransportMessageId) {
      return [];
    }

    const referencedMessage = await resolveMessageByTransportMessageId(
      ctx,
      args.conversationId,
      referencedTransportMessageId,
    );
    if (!referencedMessage) {
      return [];
    }

    if (referencedMessage.timestamp >= activeWindowStart) {
      const recentPriorMessages = await collectPriorMessagesDescending(ctx, args.conversationId, {
        inboundTimestamp,
        ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
        minimumCount: limit,
      });
      return recentPriorMessages.slice(0, limit).reverse().map(toPromptHistoryTurn);
    }

    const allPriorMessages = (await listConversationMessageDocs(ctx, args.conversationId))
      .map(toMessageDto);
    const priorMessages = filterMessagesBeforeInbound(allPriorMessages, {
      inboundTimestamp,
      ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
    });
    const referencedIndex = priorMessages.findIndex((message) => message.id === referencedMessage._id);
    if (referencedIndex === -1) {
      return [];
    }

    const sliceStart = Math.max(0, referencedIndex - REFERENCED_HISTORY_SIDE_MESSAGES);
    const sliceEnd = referencedIndex + REFERENCED_HISTORY_SIDE_MESSAGES + 1;
    return priorMessages.slice(sliceStart, sliceEnd).map(toPromptHistoryTurn);
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
