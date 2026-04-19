import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { loadConversationOrThrow, loadMessageOrThrow } from './conversation-readers';
import { applyAssistantHandoffIfNeeded } from './handoff-resume-flows';
import {
  normalizeMessageContent,
  normalizeOptionalHandoffSource,
  normalizeOptionalMessageId,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeTimestamp,
  toConversationDto,
  toMessageDto,
} from './message-helpers';

export const appendPendingAssistantMessageDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    content: v.string(),
    timestamp: v.optional(v.number()),
    source: v.optional(v.union(
      v.literal('assistant_action'),
      v.literal('provider_failure_fallback'),
      v.literal('invalid_model_output_fallback'),
    )),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const source = normalizeOptionalHandoffSource(args.source);
    const reason = normalizeOptionalString(args.reason, 'reason');
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, 'actorPhoneNumber');

    const messageId = await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      role: 'assistant',
      content,
      timestamp,
      deliveryState: 'pending',
      ...(source ? { handoffSource: source } : {}),
      ...(reason ? { handoffReason: reason } : {}),
      ...(actorPhoneNumber ? { handoffActorPhoneNumber: actorPhoneNumber } : {}),
      ...(args.metadata ? { handoffMetadata: args.metadata } : {}),
    });

    return toMessageDto(await loadMessageOrThrow(ctx, messageId));
  },
};

export const acknowledgePendingAssistantMessageDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    pendingMessageId: v.id('messages'),
    acknowledgedAt: v.number(),
    transportMessageId: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== 'assistant') {
      throw new Error('Pending assistant message not found for conversation');
    }

    if (message.deliveryState !== 'pending') {
      throw new Error('Only pending assistant messages can be acknowledged');
    }

    if (message.providerAcknowledgedAt !== undefined) {
      return toMessageDto(message);
    }

    const acknowledgedAt = normalizeTimestamp(args.acknowledgedAt, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, 'transportMessageId');
    await ctx.db.patch(message._id, {
      providerAcknowledgedAt: acknowledgedAt,
      sideEffectsState: 'pending',
      analyticsState: message.handoffSource ? 'pending' : 'not_applicable',
      ownerNotificationState: message.handoffSource ? 'pending' : 'not_applicable',
      ...(transportMessageId ? { transportMessageId } : {}),
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
};

export const listPendingAssistantMessagesDefinition = {
  args: {
    olderThanOrAt: v.number(),
    limit: v.number(),
  },
  handler: async (ctx: QueryCtx, args: any) => {
    const olderThanOrAt = normalizeTimestamp(args.olderThanOrAt, Date.now());
    const limit = normalizePositiveInteger(args.limit, 'limit');
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_role_delivery_ack_time', (q) =>
        q.eq('role', 'assistant').eq('deliveryState', 'pending').lte('providerAcknowledgedAt', olderThanOrAt)
      )
      .take(limit);

    const candidates = [];
    for (const message of messages) {
      if (message.providerAcknowledgedAt === undefined) {
        continue;
      }

      const conversation = await ctx.db.get(message.conversationId);
      if (!conversation) {
        continue;
      }

      candidates.push({
        messageId: message._id,
        conversationId: message.conversationId,
        companyId: conversation.companyId,
        phoneNumber: conversation.phoneNumber,
        timestamp: message.timestamp,
        ...(message.transportMessageId ? { transportMessageId: message.transportMessageId } : {}),
        ...(message.analyticsState ? { analyticsState: message.analyticsState } : {}),
        ...(message.ownerNotificationState ? { ownerNotificationState: message.ownerNotificationState } : {}),
      });
    }

    return candidates;
  },
};

export const getConversationOwnerNotificationContextDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
  },
  handler: async (ctx: QueryCtx, args: any) => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const company = await ctx.db.get(conversation.companyId);
    if (!company) {
      return null;
    }

    return {
      companyName: company.name,
      ownerPhone: company.ownerPhone,
    };
  },
};

export const commitPendingAssistantMessageDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    pendingMessageId: v.id('messages'),
    transportMessageId: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== 'assistant') {
      throw new Error('Pending assistant message not found for conversation');
    }

    if (message.deliveryState !== 'pending') {
      throw new Error('Only pending assistant messages can be committed');
    }

    if (message.providerAcknowledgedAt === undefined) {
      throw new Error('Pending assistant message must be acknowledged before commit');
    }

    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, 'transportMessageId');
    await ctx.db.patch(message._id, {
      deliveryState: 'sent',
      ...(message.analyticsState === 'not_applicable' && message.ownerNotificationState === 'not_applicable'
        ? { sideEffectsState: 'completed' as const }
        : {}),
      ...(transportMessageId ? { transportMessageId } : {}),
    });

    const updatedMessage = await loadMessageOrThrow(ctx, args.pendingMessageId);
    await applyAssistantHandoffIfNeeded(ctx, {
      companyId: args.companyId,
      conversation,
      message: updatedMessage,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
};

export const markPendingAssistantMessageFailedDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    pendingMessageId: v.id('messages'),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== 'assistant') {
      throw new Error('Pending assistant message not found for conversation');
    }

    if (message.deliveryState !== 'pending') {
      throw new Error('Only pending assistant messages can be marked failed');
    }

    if (message.providerAcknowledgedAt !== undefined) {
      throw new Error('Acknowledged assistant messages must be reconciled, not marked failed');
    }

    await ctx.db.patch(message._id, {
      deliveryState: 'failed',
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
};
