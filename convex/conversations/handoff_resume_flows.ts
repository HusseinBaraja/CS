import { v } from 'convex/values';
import type { ConversationStateEventSource, ConversationStateEventType } from '@cs/shared';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { AUTO_RESUME_IDLE_MS } from './constants';
import { loadConversationOrThrow, loadMessageOrThrow } from './conversation_readers';
import {
  normalizeMessageContent,
  normalizeOptionalMessageId,
  normalizeOptionalString,
  normalizeTimestamp,
  toConversationDto,
} from './message_helpers';

const insertConversationStateEvent = async (
  ctx: MutationCtx,
  input: {
    companyId: Id<'companies'>;
    conversationId: Id<'conversations'>;
    phoneNumber: string;
    eventType: ConversationStateEventType;
    timestamp: number;
    source: ConversationStateEventSource;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  },
): Promise<void> => {
  await ctx.db.insert('conversationStateEvents', {
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

export const applyAssistantHandoffIfNeeded = async (
  ctx: MutationCtx,
  input: {
    companyId: Id<'companies'>;
    conversation: Doc<'conversations'>;
    message: Doc<'messages'>;
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
    eventType: 'handoff_started',
    timestamp: input.message.timestamp,
    source,
    ...(input.message.handoffReason ? { reason: input.message.handoffReason } : {}),
    ...(input.message.handoffActorPhoneNumber ? { actorPhoneNumber: input.message.handoffActorPhoneNumber } : {}),
    ...(input.message.handoffMetadata ? { metadata: input.message.handoffMetadata } : {}),
  });
};

export const appendAssistantMessageAndStartHandoffDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    content: v.string(),
    timestamp: v.optional(v.number()),
    source: v.union(
      v.literal('assistant_action'),
      v.literal('provider_failure_fallback'),
      v.literal('invalid_model_output_fallback'),
    ),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
    transportMessageId: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (conversation.muted) {
      return toConversationDto(conversation);
    }

    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const reason = normalizeOptionalString(args.reason, 'reason');
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, 'actorPhoneNumber');
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, 'transportMessageId');

    const messageId = await ctx.db.insert('messages', {
      companyId: args.companyId,
      conversationId: args.conversationId,
      role: 'assistant',
      content,
      timestamp,
      deliveryState: 'sent',
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
};

export const startHandoffDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    triggerTimestamp: v.optional(v.number()),
    source: v.union(
      v.literal('assistant_action'),
      v.literal('provider_failure_fallback'),
      v.literal('invalid_model_output_fallback'),
      v.literal('api_manual'),
    ),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (conversation.muted) {
      return toConversationDto(conversation);
    }

    const triggerTimestamp = normalizeTimestamp(args.triggerTimestamp, Date.now());
    const reason = normalizeOptionalString(args.reason, 'reason');
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, 'actorPhoneNumber');

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
      eventType: 'handoff_started',
      timestamp: triggerTimestamp,
      source: args.source,
      ...(reason ? { reason } : {}),
      ...(actorPhoneNumber ? { actorPhoneNumber } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
};

export const resumeConversationDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    resumedAt: v.optional(v.number()),
    source: v.union(v.literal('api_manual'), v.literal('worker_auto')),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      return toConversationDto(conversation);
    }

    const resumedAt = normalizeTimestamp(args.resumedAt, Date.now());
    const reason = normalizeOptionalString(args.reason, 'reason');
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, 'actorPhoneNumber');

    if (
      args.source === 'worker_auto' &&
      (conversation.nextAutoResumeAt === undefined || conversation.nextAutoResumeAt > resumedAt)
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
      eventType: args.source === 'api_manual' ? 'handoff_resumed_manual' : 'handoff_resumed_auto',
      timestamp: resumedAt,
      source: args.source,
      ...(reason ? { reason } : {}),
      ...(actorPhoneNumber ? { actorPhoneNumber } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
};

export { recordMutedCustomerActivityDefinition } from './handoff_resume_activity';
