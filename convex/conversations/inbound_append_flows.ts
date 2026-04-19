import { v } from 'convex/values';
import type { ConversationMessageDto, ConversationStateDto } from '@cs/shared';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { AUTO_RESUME_IDLE_MS } from './constants';
import { loadConversationOrThrow } from './conversation_readers';
import { withConversationLock } from './lock_helpers';
import {
  normalizeMessageContent,
  normalizeOptionalMessageId,
  normalizePhoneNumber,
  normalizeTimestamp,
  resolveExistingMessageInsert,
  toConversationDto,
  toMessageDto,
} from './message_helpers';
import type { AppendInboundCustomerMessageResult } from './types';
export {
  ensureActiveConversationDefinition,
  getOrCreateActiveConversationDefinition,
  getOrCreateConversationForInboundDefinition,
} from './inbound_conversation_entrypoints';

export const appendConversationMessageDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      conversationId: Id<'conversations'>;
      role: 'user' | 'assistant';
      content: string;
      timestamp?: number;
      transportMessageId?: string;
      referencedTransportMessageId?: string;
    },
  ): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, 'transportMessageId');
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      'referencedTransportMessageId',
    );

    const messageId = await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      role: args.role,
      content,
      timestamp,
      ...(args.role === 'assistant' ? { deliveryState: 'sent' as const } : {}),
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
    });
    const message = await ctx.db.get(messageId);
    if (!message) {
      throw new Error('Created message could not be loaded');
    }

    return toMessageDto(message);
  },
};

export const appendMutedCustomerMessageDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      conversationId: Id<'conversations'>;
      content: string;
      timestamp?: number;
      transportMessageId?: string;
      referencedTransportMessageId?: string;
    },
  ): Promise<ConversationStateDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      throw new Error('Conversation is not muted');
    }

    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, 'transportMessageId');
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      'referencedTransportMessageId',
    );
    const existingMessage = await resolveExistingMessageInsert(ctx, args.conversationId, transportMessageId);
    if (existingMessage) {
      return toConversationDto(conversation);
    }

    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      role: 'user',
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
};

export const appendInboundCustomerMessageToConversationDefinition = {
  args: {
    companyId: v.id('companies'),
    conversationId: v.id('conversations'),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      conversationId: Id<'conversations'>;
      content: string;
      timestamp?: number;
      transportMessageId?: string;
      referencedTransportMessageId?: string;
    },
  ): Promise<AppendInboundCustomerMessageResult> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, 'transportMessageId');
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      'referencedTransportMessageId',
    );
    const existingMessage = await resolveExistingMessageInsert(ctx, args.conversationId, transportMessageId);
    if (existingMessage) {
      return {
        conversation: toConversationDto(conversation),
        wasMuted: conversation.muted,
        wasDuplicate: true,
      };
    }

    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      role: 'user',
      content,
      timestamp,
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
    });

    if (!conversation.muted) {
      return {
        conversation: toConversationDto(conversation),
        wasMuted: false,
        wasDuplicate: false,
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
      wasDuplicate: false,
    };
  },
};

export const appendInboundCustomerMessageDefinition = {
  args: {
    companyId: v.id('companies'),
    phoneNumber: v.string(),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      companyId: Id<'companies'>;
      phoneNumber: string;
      content: string;
      timestamp?: number;
      transportMessageId?: string;
      referencedTransportMessageId?: string;
    },
  ): Promise<AppendInboundCustomerMessageResult> => {
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
        conversationId: conversation.id as Id<'conversations'>,
        content: args.content,
        timestamp: args.timestamp,
        transportMessageId: args.transportMessageId,
        referencedTransportMessageId: args.referencedTransportMessageId,
      });
    });
  },
};
