import { v } from 'convex/values';
import type { ConversationStateDto } from '@cs/shared';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { listActiveConversations } from './conversation-readers';
import { withConversationLock } from './lock-helpers';
import { normalizePhoneNumber, toConversationDto } from './message-helpers';

export const ensureActiveConversationDefinition = {
  args: {
    companyId: v.id('companies'),
    phoneNumber: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: { companyId: Id<'companies'>; phoneNumber: string },
  ): Promise<ConversationStateDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    const existing = await listActiveConversations(ctx, args.companyId, phoneNumber);
    if (existing[0]) {
      return toConversationDto(existing[0]);
    }

    const conversationId = await ctx.db.insert('conversations', {
      companyId: args.companyId,
      phoneNumber,
      muted: false,
    });
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      throw new Error('Created conversation could not be loaded');
    }

    return toConversationDto(conversation);
  },
};

export const getOrCreateActiveConversationDefinition = {
  args: {
    companyId: v.id('companies'),
    phoneNumber: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args: { companyId: Id<'companies'>; phoneNumber: string; now?: number },
  ): Promise<ConversationStateDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    return withConversationLock(ctx, args, async () => {
      return await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });
    });
  },
};

export const getOrCreateConversationForInboundDefinition = {
  args: {
    companyId: v.id('companies'),
    phoneNumber: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args: { companyId: Id<'companies'>; phoneNumber: string; now?: number },
  ): Promise<ConversationStateDto> => {
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
};
