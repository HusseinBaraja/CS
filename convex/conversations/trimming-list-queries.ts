import { v } from 'convex/values';
import type { ConversationMessageDto, ConversationStateDto } from '@cs/shared';
import type { Doc, Id } from '../_generated/dataModel';
import type { DatabaseReader, MutationCtx, QueryCtx } from '../_generated/server';
import {
  LIST_CONVERSATION_MESSAGES_BATCH_SIZE,
  TRIM_MESSAGES_BATCH_SIZE,
} from './constants';
import {
  loadConversationByPhone,
  loadConversationOrThrow,
} from './conversation-readers';
import {
  isVisibleConversationMessage,
  normalizeOptionalLimit,
  normalizePositiveInteger,
  normalizePhoneNumber,
  normalizeTimestamp,
  toConversationDto,
  toMessageDto,
} from './message-helpers';
import type { TrimConversationMessagesResult } from './types';

const listConversationMessageDocsDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<'conversations'>,
) =>
  ctx.db
    .query('messages')
    .withIndex('by_conversation_time', (q) => q.eq('conversationId', conversationId))
    .order('desc')
    .collect();

const listConversationMessageDocsPageDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<'conversations'>,
  input: {
    cursor: string | null;
    limit: number;
  },
) =>
  ctx.db
    .query('messages')
    .withIndex('by_conversation_time', (q) => q.eq('conversationId', conversationId))
    .order('desc')
    .paginate({
      cursor: input.cursor,
      numItems: input.limit,
    });

const listVisibleConversationMessagesDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<'conversations'>,
  limit: number,
): Promise<Array<Doc<'messages'>>> => {
  const visibleMessages: Array<Doc<'messages'>> = [];
  let cursor: string | null = null;
  const batchSize = Math.max(limit, LIST_CONVERSATION_MESSAGES_BATCH_SIZE);

  while (visibleMessages.length < limit) {
    const page = await listConversationMessageDocsPageDescending(ctx, conversationId, {
      cursor,
      limit: batchSize,
    });

    const remaining = limit - visibleMessages.length;
    visibleMessages.push(...page.page.filter(isVisibleConversationMessage).slice(0, remaining));
    if (visibleMessages.length >= limit) {
      break;
    }

    if (page.isDone || page.continueCursor === cursor || page.page.length === 0) {
      break;
    }

    cursor = page.continueCursor;
  }

  return visibleMessages;
};

export const getConversationByPhoneDefinition = {
  args: {
    companyId: v.id('companies'),
    phoneNumber: v.string(),
  },
  handler: async (
    ctx: QueryCtx,
    args: { companyId: Id<'companies'>; phoneNumber: string },
  ): Promise<ConversationStateDto | null> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    const conversation = await loadConversationByPhone(ctx, args.companyId, phoneNumber);
    return conversation ? toConversationDto(conversation) : null;
  },
};

export const getConversationDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
  },
  handler: async (
    ctx: QueryCtx,
    args: { companyId: Id<'companies'>; conversationId: Id<'conversations'> },
  ): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(conversation);
  },
};

export { getConversationMessageDefinition } from './trimming-conversation-message';

export const listConversationMessagesDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx: QueryCtx,
    args: { companyId: Id<'companies'>; conversationId: Id<'conversations'>; limit?: number },
  ): Promise<ConversationMessageDto[]> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const limit = normalizeOptionalLimit(args.limit);

    if (limit !== undefined) {
      return (await listVisibleConversationMessagesDescending(ctx, args.conversationId, limit))
        .reverse()
        .map(toMessageDto);
    }

    const visibleMessages = (await listConversationMessageDocsDescending(ctx, args.conversationId))
      .filter(isVisibleConversationMessage);
    return visibleMessages
      .reverse()
      .map(toMessageDto);
  },
};

export const listDueAutoResumeConversationsDefinition = {
  args: {
    now: v.number(),
    limit: v.number(),
  },
  handler: async (ctx: QueryCtx, args: { now: number; limit: number }): Promise<ConversationStateDto[]> => {
    const now = normalizeTimestamp(args.now, Date.now());
    const limit = normalizePositiveInteger(args.limit, 'limit');
    const conversations = await ctx.db
      .query('conversations')
      .withIndex('by_muted_next_auto_resume_at', (q) => q.eq('muted', true).lte('nextAutoResumeAt', now))
      .take(limit);

    return conversations.map(toConversationDto);
  },
};

export const trimConversationMessagesDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    maxMessages: v.number(),
  },
  handler: async (
    ctx: MutationCtx,
    args: { companyId: Id<'companies'>; conversationId: Id<'conversations'>; maxMessages: number },
  ): Promise<TrimConversationMessagesResult> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const maxMessages = normalizePositiveInteger(args.maxMessages, 'maxMessages');
    let cursor: string | null = null;
    let totalMessages = 0;
    const idsToDelete: Array<Id<'messages'>> = [];
    const retainedIds: Array<Id<'messages'>> = [];

    for (;;) {
      const page = await ctx.db
        .query('messages')
        .withIndex('by_conversation_time', (q) => q.eq('conversationId', args.conversationId))
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
};
