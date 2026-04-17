import { v } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import { loadConversationOrThrow, loadMessageOrThrow } from './conversation-readers';
import { resolveSideEffectsState, toMessageDto } from './message-helpers';

export const completePendingAssistantSideEffectsDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    pendingMessageId: v.id('messages'),
    analyticsCompleted: v.optional(v.boolean()),
    ownerNotificationCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== 'assistant') {
      throw new Error('Pending assistant message not found for conversation');
    }

    if (message.deliveryState !== 'sent') {
      throw new Error('Assistant side effects can only be completed after send');
    }

    const nextAnalyticsState =
      args.analyticsCompleted === true
        && (message.analyticsState === 'pending' || message.analyticsState === 'recorded')
        ? 'completed'
        : message.analyticsState;
    const nextOwnerNotificationState =
      args.ownerNotificationCompleted === true
        && (message.ownerNotificationState === 'pending' || message.ownerNotificationState === 'sent')
        ? 'completed'
        : message.ownerNotificationState;

    await ctx.db.patch(message._id, {
      ...(nextAnalyticsState ? { analyticsState: nextAnalyticsState } : {}),
      ...(nextOwnerNotificationState ? { ownerNotificationState: nextOwnerNotificationState } : {}),
      sideEffectsState: resolveSideEffectsState({
        analyticsState: nextAnalyticsState,
        ownerNotificationState: nextOwnerNotificationState,
      }),
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
};

export const recordPendingAssistantSideEffectProgressDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    pendingMessageId: v.id('messages'),
    analyticsRecorded: v.optional(v.boolean()),
    ownerNotificationSent: v.optional(v.boolean()),
  },
  handler: async (ctx: MutationCtx, args: any) => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== 'assistant') {
      throw new Error('Pending assistant message not found for conversation');
    }

    if (message.deliveryState !== 'sent') {
      throw new Error('Assistant side effect progress can only be recorded after send');
    }

    const nextAnalyticsState =
      args.analyticsRecorded === true && message.analyticsState === 'pending'
        ? 'recorded'
        : message.analyticsState;
    const nextOwnerNotificationState =
      args.ownerNotificationSent === true && message.ownerNotificationState === 'pending'
        ? 'sent'
        : message.ownerNotificationState;

    await ctx.db.patch(message._id, {
      ...(nextAnalyticsState ? { analyticsState: nextAnalyticsState } : {}),
      ...(nextOwnerNotificationState ? { ownerNotificationState: nextOwnerNotificationState } : {}),
      sideEffectsState: resolveSideEffectsState({
        analyticsState: nextAnalyticsState,
        ownerNotificationState: nextOwnerNotificationState,
      }),
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
};
