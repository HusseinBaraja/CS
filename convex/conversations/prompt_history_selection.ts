import { v } from 'convex/values';
import type { PromptHistoryTurn } from '@cs/ai';
import type { DatabaseReader, QueryCtx } from '../_generated/server';
import { REFERENCED_HISTORY_SIDE_MESSAGES, STALE_CONTEXT_RESET_MS } from './constants';
import { loadConversationOrThrow } from './conversation_readers';
import {
  isVisibleConversationMessage,
  normalizeOptionalMessageId,
  normalizePositiveInteger,
  normalizeTimestamp,
  resolveMessageByTransportMessageId,
  toMessageDto,
  toPromptHistoryTurn,
} from './message_helpers';
import type { PromptHistorySelectionResult } from './types';

export { getPromptHistoryDefinition } from './prompt_history_query';
const isMessageBeforeInbound = (message: any, input: any): boolean =>
  isVisibleConversationMessage(message)
  && (
    message.timestamp < input.inboundTimestamp
    || (
      message.timestamp === input.inboundTimestamp
      && message.transportMessageId !== input.currentTransportMessageId
    )
  );

const iterateConversationMessagesDescending = (
  ctx: { db: DatabaseReader },
  conversationId: any,
) =>
  ctx.db
    .query('messages')
    .withIndex('by_conversation_time', (q) => q.eq('conversationId', conversationId))
    .order('desc');

const iterateConversationMessagesAscending = (
  ctx: { db: DatabaseReader },
  conversationId: any,
) =>
  ctx.db
    .query('messages')
    .withIndex('by_conversation_time', (q) => q.eq('conversationId', conversationId))
    .order('asc');

const collectPriorMessagesDescending = async (ctx: { db: DatabaseReader }, conversationId: any, input: any) => {
  const priorMessages = [];

  for await (const messageDoc of iterateConversationMessagesDescending(ctx, conversationId)) {
    const message = toMessageDto(messageDoc);
    if (!isMessageBeforeInbound(message, input)) {
      continue;
    }

    priorMessages.push(message);
    if (input.stopWhenPriorMessagesFound) {
      return priorMessages;
    }

    if (input.minimumCount !== undefined && priorMessages.length >= input.minimumCount) {
      return priorMessages;
    }
  }

  return priorMessages;
};

const collectReferencedHistorySliceAscending = async (ctx: { db: DatabaseReader }, conversationId: any, input: any) => {
  const precedingMessages = [];
  const referencedWindow = [];
  let foundReferencedMessage = false;
  let afterMessagesCount = 0;

  for await (const messageDoc of iterateConversationMessagesAscending(ctx, conversationId)) {
    const message = toMessageDto(messageDoc);
    if (!isMessageBeforeInbound(message, input)) {
      continue;
    }

    if (!foundReferencedMessage) {
      if (message.id === input.referencedMessageId) {
        foundReferencedMessage = true;
        referencedWindow.push(...precedingMessages, message);
        continue;
      }

      precedingMessages.push(message);
      if (precedingMessages.length > REFERENCED_HISTORY_SIDE_MESSAGES) {
        precedingMessages.shift();
      }
      continue;
    }

    referencedWindow.push(message);
    afterMessagesCount += 1;
    if (afterMessagesCount >= REFERENCED_HISTORY_SIDE_MESSAGES) {
      return referencedWindow;
    }
  }

  return foundReferencedMessage ? referencedWindow : [];
};

export const getPromptHistorySelectionForInboundInternal = async (
  ctx: { db: DatabaseReader },
  input: any,
): Promise<PromptHistorySelectionResult> => {
  await loadConversationOrThrow(ctx, input.companyId, input.conversationId);
  const inboundTimestamp = normalizeTimestamp(input.inboundTimestamp, Date.now());
  const limit = normalizePositiveInteger(input.limit, 'limit');
  const currentTransportMessageId = normalizeOptionalMessageId(
    input.currentTransportMessageId,
    'currentTransportMessageId',
  );
  const referencedTransportMessageId = normalizeOptionalMessageId(
    input.referencedTransportMessageId,
    'referencedTransportMessageId',
  );

  const priorMessagesDescending = await collectPriorMessagesDescending(ctx, input.conversationId, {
    inboundTimestamp,
    ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
    stopWhenPriorMessagesFound: true,
  });

  if (priorMessagesDescending.length === 0) {
    return {
      history: [],
      historySelection: {
        reason: 'empty',
      },
    };
  }

  const latestMessage = priorMessagesDescending[0];
  const activeWindowStart = inboundTimestamp - STALE_CONTEXT_RESET_MS;
  if (latestMessage && latestMessage.timestamp >= activeWindowStart) {
    const recentPriorMessages = await collectPriorMessagesDescending(ctx, input.conversationId, {
      inboundTimestamp,
      ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
      minimumCount: limit,
    });

    return {
      history: recentPriorMessages.slice(0, limit).reverse().map(toPromptHistoryTurn),
      historySelection: {
        reason: 'recent_window',
      },
    };
  }

  if (!referencedTransportMessageId) {
    return {
      history: [],
      historySelection: {
        reason: 'empty',
      },
    };
  }

  const referencedMessage = await resolveMessageByTransportMessageId(
    ctx,
    input.conversationId,
    referencedTransportMessageId,
  );
  if (!referencedMessage) {
    return {
      history: [],
      historySelection: {
        reason: 'empty',
      },
    };
  }

  if (referencedMessage.timestamp >= activeWindowStart) {
    const recentPriorMessages = await collectPriorMessagesDescending(ctx, input.conversationId, {
      inboundTimestamp,
      ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
      minimumCount: limit,
    });

    return {
      history: recentPriorMessages.slice(0, limit).reverse().map(toPromptHistoryTurn),
      historySelection: {
        reason: 'recent_window',
      },
    };
  }

  const referencedWindow = await collectReferencedHistorySliceAscending(ctx, input.conversationId, {
    inboundTimestamp,
    ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
    referencedMessageId: referencedMessage._id,
  });

  return {
    history: referencedWindow.map(toPromptHistoryTurn),
    historySelection: {
      reason: 'quoted_reply_slice',
      quotedMessage: toPromptHistoryTurn(toMessageDto(referencedMessage)),
    },
  };
};

export const getPromptHistoryForInboundDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    inboundTimestamp: v.number(),
    currentTransportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx: QueryCtx, args: any): Promise<PromptHistoryTurn[]> => {
    return (await getPromptHistorySelectionForInboundInternal(ctx, args)).history;
  },
};

export const getPromptHistorySelectionForInboundDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    inboundTimestamp: v.number(),
    currentTransportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx: QueryCtx, args: any): Promise<PromptHistorySelectionResult> => {
    return getPromptHistorySelectionForInboundInternal(ctx, args);
  },
};
