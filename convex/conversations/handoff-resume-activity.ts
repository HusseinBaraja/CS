import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { AUTO_RESUME_IDLE_MS } from './constants';
import { loadConversationOrThrow } from './conversation-readers';
import { normalizeTimestamp, toConversationDto } from './message-helpers';

type RecordMutedCustomerActivityArgs = {
  companyId: Id<'companies'>;
  conversationId: Id<'conversations'>;
  timestamp?: number;
};

export const recordMutedCustomerActivityDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: RecordMutedCustomerActivityArgs) => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      throw new Error('Conversation is not muted');
    }

    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    await ctx.db.patch(conversation._id, {
      lastCustomerMessageAt: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
};
