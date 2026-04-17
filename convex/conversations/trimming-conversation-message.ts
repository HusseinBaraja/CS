import { v } from 'convex/values';
import type { ConversationMessageDto } from '@cs/shared';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { loadConversationOrThrow } from './conversation-readers';
import { toMessageDto } from './message-helpers';

export const getConversationMessageDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    messageId: v.id('messages'),
  },
  handler: async (
    ctx: QueryCtx,
    args: { companyId: Id<'companies'>; conversationId: Id<'conversations'>; messageId: Id<'messages'> },
  ): Promise<ConversationMessageDto | null> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.conversationId !== args.conversationId) {
      return null;
    }

    return toMessageDto(message);
  },
};
