import { v } from 'convex/values';
import type { PromptHistoryTurn } from '@cs/ai';
import { internal } from '../_generated/api';
import type { QueryCtx } from '../_generated/server';
import { normalizePositiveInteger, toPromptHistoryTurn } from './message-helpers';

export const getPromptHistoryDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    limit: v.number(),
  },
  handler: async (ctx: QueryCtx, args: any): Promise<PromptHistoryTurn[]> => {
    const messages = await ctx.runQuery(internal.conversations.listConversationMessages, {
      companyId: args.companyId,
      conversationId: args.conversationId,
      limit: normalizePositiveInteger(args.limit, 'limit'),
    });

    return messages.map(toPromptHistoryTurn);
  },
};
