import type { PromptHistoryTurn } from '@cs/ai';
import type {
  ConversationMessageDto,
  ConversationStateDto,
} from '@cs/shared';
import type { Doc, Id } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';
import type { AssistantHandoffSource } from './types';

export const normalizePhoneNumber = (phoneNumber: string): string => {
  const normalized = phoneNumber.trim();
  if (normalized.length === 0) {
    throw new Error('phoneNumber is required');
  }

  return normalized;
};

export const normalizeTimestamp = (timestamp: number | undefined, fallback: number): number => {
  const candidate = timestamp ?? fallback;
  if (!Number.isFinite(candidate)) {
    throw new Error('timestamp must be a finite number');
  }

  return Math.trunc(candidate);
};

export const normalizePositiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return normalized;
};

export const normalizeOptionalLimit = (limit: number | undefined): number | undefined =>
  limit === undefined ? undefined : normalizePositiveInteger(limit, 'limit');

export const normalizeMessageContent = (content: string): string => {
  const normalized = content.trim();
  if (normalized.length === 0) {
    throw new Error('content must be a non-empty string');
  }

  return normalized;
};

export const normalizeOptionalString = (value: string | undefined, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string when provided`);
  }

  return normalized;
};

export const normalizeOptionalMessageId = (
  value: string | undefined,
  fieldName: string,
): string | undefined => normalizeOptionalString(value, fieldName);

export const normalizeOptionalHandoffSource = (
  value: AssistantHandoffSource | undefined,
): AssistantHandoffSource | undefined => value;

export const resolveSideEffectsState = (
  message: Pick<Doc<'messages'>, 'analyticsState' | 'ownerNotificationState'>,
): 'pending' | 'completed' => {
  const analyticsComplete =
    message.analyticsState === 'completed' || message.analyticsState === 'not_applicable';
  const ownerNotificationComplete =
    message.ownerNotificationState === 'completed' || message.ownerNotificationState === 'not_applicable';

  return analyticsComplete && ownerNotificationComplete ? 'completed' : 'pending';
};

export const toConversationDto = (conversation: Doc<'conversations'>): ConversationStateDto => ({
  id: conversation._id,
  companyId: conversation.companyId,
  phoneNumber: conversation.phoneNumber,
  muted: conversation.muted,
  ...(conversation.mutedAt !== undefined ? { mutedAt: conversation.mutedAt } : {}),
  ...(conversation.lastCustomerMessageAt !== undefined
    ? { lastCustomerMessageAt: conversation.lastCustomerMessageAt }
    : {}),
  ...(conversation.nextAutoResumeAt !== undefined ? { nextAutoResumeAt: conversation.nextAutoResumeAt } : {}),
});

export const toMessageDto = (message: Doc<'messages'>): ConversationMessageDto => ({
  id: message._id,
  ...(message.companyId !== undefined ? { companyId: message.companyId } : {}),
  conversationId: message.conversationId,
  role: message.role,
  content: message.content,
  timestamp: message.timestamp,
  ...(message.deliveryState !== undefined ? { deliveryState: message.deliveryState } : {}),
  ...(message.handoffSource !== undefined ? { handoffSource: message.handoffSource } : {}),
  ...(message.providerAcknowledgedAt !== undefined
    ? { providerAcknowledgedAt: message.providerAcknowledgedAt }
    : {}),
  ...(message.sideEffectsState !== undefined ? { sideEffectsState: message.sideEffectsState } : {}),
  ...(message.ownerNotificationState !== undefined
    ? { ownerNotificationState: message.ownerNotificationState }
    : {}),
  ...(message.analyticsState !== undefined ? { analyticsState: message.analyticsState } : {}),
  ...(message.transportMessageId !== undefined ? { transportMessageId: message.transportMessageId } : {}),
  ...(message.referencedTransportMessageId !== undefined
    ? { referencedTransportMessageId: message.referencedTransportMessageId }
    : {}),
});

export const toPromptHistoryTurn = (message: ConversationMessageDto): PromptHistoryTurn => ({
  role: message.role,
  text: message.content,
});

export const isVisibleConversationMessage = (
  message: Pick<Doc<'messages'>, 'role' | 'deliveryState'>,
): boolean => message.role === 'user' || message.deliveryState === 'sent';

export const resolveMessageByTransportMessageId = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<'conversations'>,
  transportMessageId: string,
): Promise<Doc<'messages'> | null> => {
  const normalizedTransportMessageId = normalizeOptionalMessageId(transportMessageId, 'transportMessageId');
  if (!normalizedTransportMessageId) {
    return null;
  }

  const messages = await ctx.db
    .query('messages')
    .withIndex('by_conversation_transport_message_id', (q) =>
      q.eq('conversationId', conversationId).eq('transportMessageId', normalizedTransportMessageId)
    )
    .collect();

  return messages[0] ?? null;
};

export const resolveExistingMessageInsert = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<'conversations'>,
  transportMessageId: string | undefined,
): Promise<Doc<'messages'> | null> => {
  if (!transportMessageId) {
    return null;
  }

  return resolveMessageByTransportMessageId(ctx, conversationId, transportMessageId);
};
