import type { PromptHistoryTurn } from '@cs/ai';
import type {
  AnalyticsEventType,
  ConversationMessageDto,
  ConversationStateDto,
  ConversationStateEventSource,
} from '@cs/shared';
import { convexInternal, createConvexAdminClient, type ConvexAdminClient, type Id } from '@cs/db';
export type ConversationRecord = ConversationStateDto;
export type ConversationMessageRecord = ConversationMessageDto;

export interface AppendConversationMessageInput {
  companyId: string;
  conversationId: string;
  content: string;
  timestamp: number;
  transportMessageId?: string;
  referencedTransportMessageId?: string;
}

export interface AppendInboundCustomerMessageInput {
  companyId: string;
  phoneNumber: string;
  content: string;
  timestamp: number;
  transportMessageId?: string;
  referencedTransportMessageId?: string;
}

export interface AppendInboundCustomerMessageResult {
  conversation: ConversationRecord;
  wasMuted: boolean;
  wasDuplicate: boolean;
}

export interface ConversationStore {
  getOrCreateActiveConversation(companyId: string, phoneNumber: string): Promise<ConversationRecord>;
  getOrCreateConversationForInbound(companyId: string, phoneNumber: string): Promise<ConversationRecord>;
  appendInboundCustomerMessage(input: AppendInboundCustomerMessageInput): Promise<AppendInboundCustomerMessageResult>;
  appendUserMessage(input: AppendConversationMessageInput): Promise<ConversationMessageRecord>;
  appendMutedCustomerMessage(input: AppendConversationMessageInput): Promise<ConversationRecord>;
  appendPendingAssistantMessage(input: {
    companyId: string;
    conversationId: string;
    content: string;
    timestamp: number;
    source?: Extract<ConversationStateEventSource, "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback">;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<ConversationMessageRecord>;
  commitPendingAssistantMessage(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
    transportMessageId?: string;
  }): Promise<ConversationRecord>;
  markPendingAssistantMessageFailed(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
  }): Promise<ConversationMessageRecord>;
  appendAssistantMessage(input: AppendConversationMessageInput): Promise<ConversationMessageRecord>;
  appendAssistantMessageAndStartHandoff(input: {
    companyId: string;
    conversationId: string;
    content: string;
    timestamp: number;
    source: Extract<ConversationStateEventSource, "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback">;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
    transportMessageId?: string;
  }): Promise<ConversationRecord>;
  startHandoff(input: {
    companyId: string;
    conversationId: string;
    triggerTimestamp: number;
    source: Extract<ConversationStateEventSource, "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback">;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<ConversationRecord>;
  resumeConversation(input: {
    companyId: string;
    conversationId: string;
    resumedAt: number;
    source: Extract<ConversationStateEventSource, "api_manual" | "worker_auto">;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<ConversationRecord>;
  recordMutedCustomerActivity(input: {
    companyId: string;
    conversationId: string;
    timestamp: number;
  }): Promise<ConversationRecord>;
  getConversation(input: { companyId: string; conversationId: string }): Promise<ConversationRecord>;
  getPromptHistory(input: { companyId: string; conversationId: string; limit: number }): Promise<PromptHistoryTurn[]>;
  getPromptHistoryForInbound(input: {
    companyId: string;
    conversationId: string;
    inboundTimestamp: number;
    currentTransportMessageId?: string;
    referencedTransportMessageId?: string;
    limit: number;
  }): Promise<PromptHistoryTurn[]>;
  listRecentMessages(input: { companyId: string; conversationId: string; limit: number }): Promise<ConversationMessageRecord[]>;
  recordAnalyticsEvent(input: {
    companyId: string;
    eventType: AnalyticsEventType;
    timestamp: number;
    payload?: Record<string, string | number | boolean>;
  }): Promise<void>;
  trimConversationMessages(input: {
    companyId: string;
    conversationId: string;
    maxMessages: number;
  }): Promise<{ deletedCount: number; remainingCount: number }>;
}

export interface ConvexConversationStoreOptions {
  createClient?: () => ConvexAdminClient;
}

const CONVEX_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const toConvexId = <TableName extends "companies" | "conversations" | "messages">(
  tableName: TableName,
  rawValue: string,
): Id<TableName> => {
  const normalizedValue = rawValue.trim();
  if (normalizedValue.length === 0 || !CONVEX_ID_PATTERN.test(normalizedValue)) {
    throw new Error(
      `Invalid ${tableName} id "${rawValue}": expected a non-empty identifier containing only letters, numbers, "_" or "-"`,
    );
  }

  return normalizedValue as Id<TableName>;
};

export const toCompanyId = (companyId: string): Id<"companies"> => toConvexId("companies", companyId);

const toConversationId = (conversationId: string): Id<"conversations"> => {
  return toConvexId("conversations", conversationId);
};

const toMessageId = (messageId: string): Id<"messages"> => {
  return toConvexId("messages", messageId);
};

export const createConvexConversationStore = (
  options: ConvexConversationStoreOptions = {},
): ConversationStore => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const client = createClient();

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> =>
    callback(client);

  const appendMessage = (
    role: "user" | "assistant",
    input: AppendConversationMessageInput,
  ): Promise<ConversationMessageRecord> =>
    withClient((client) =>
      client.mutation(convexInternal.conversations.appendConversationMessage, {
        companyId: toCompanyId(input.companyId),
        conversationId: toConversationId(input.conversationId),
        role,
        content: input.content,
        timestamp: input.timestamp,
        ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
        ...(input.referencedTransportMessageId
          ? { referencedTransportMessageId: input.referencedTransportMessageId }
          : {}),
      })
    );

  return {
    appendPendingAssistantMessage: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.appendPendingAssistantMessage, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          content: input.content,
          timestamp: input.timestamp,
          ...(input.source ? { source: input.source } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.actorPhoneNumber ? { actorPhoneNumber: input.actorPhoneNumber } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        })
      ),
    commitPendingAssistantMessage: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.commitPendingAssistantMessage, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          pendingMessageId: toMessageId(input.pendingMessageId),
          ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
        })
      ),
    markPendingAssistantMessageFailed: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.markPendingAssistantMessageFailed, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          pendingMessageId: toMessageId(input.pendingMessageId),
        })
      ),
    appendAssistantMessage: (input) => appendMessage("assistant", input),
    appendInboundCustomerMessage: (input) =>
      withClient((client) =>
        client.action(convexInternal.conversations.appendInboundCustomerMessage, {
          companyId: toCompanyId(input.companyId),
          phoneNumber: input.phoneNumber,
          content: input.content,
          timestamp: input.timestamp,
          ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
          ...(input.referencedTransportMessageId
            ? { referencedTransportMessageId: input.referencedTransportMessageId }
            : {}),
        })
      ),
    appendAssistantMessageAndStartHandoff: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.appendAssistantMessageAndStartHandoff, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          content: input.content,
          timestamp: input.timestamp,
          source: input.source,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.actorPhoneNumber ? { actorPhoneNumber: input.actorPhoneNumber } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
          ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
        })
      ),
    appendMutedCustomerMessage: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.appendMutedCustomerMessage, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          content: input.content,
          timestamp: input.timestamp,
        })
      ),
    appendUserMessage: (input) => appendMessage("user", input),
    getOrCreateActiveConversation: (companyId, phoneNumber) =>
      withClient((client) =>
        client.action(convexInternal.conversations.getOrCreateActiveConversation, {
          companyId: toCompanyId(companyId),
          phoneNumber,
        })
      ),
    getOrCreateConversationForInbound: (companyId, phoneNumber) =>
      withClient((client) =>
        client.action(convexInternal.conversations.getOrCreateConversationForInbound, {
          companyId: toCompanyId(companyId),
          phoneNumber,
        })
      ),
    startHandoff: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.startHandoff, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          triggerTimestamp: input.triggerTimestamp,
          source: input.source,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.actorPhoneNumber ? { actorPhoneNumber: input.actorPhoneNumber } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        })
      ),
    resumeConversation: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.resumeConversation, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          resumedAt: input.resumedAt,
          source: input.source,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.actorPhoneNumber ? { actorPhoneNumber: input.actorPhoneNumber } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        })
      ),
    recordMutedCustomerActivity: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.recordMutedCustomerActivity, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          timestamp: input.timestamp,
        })
      ),
    getConversation: (input) =>
      withClient((client) =>
        client.query(convexInternal.conversations.getConversation, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
        })
      ),
    getPromptHistory: (input) =>
      withClient((client) =>
        client.query(convexInternal.conversations.getPromptHistory, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          limit: input.limit,
        })
      ),
    getPromptHistoryForInbound: (input) =>
      withClient((client) =>
        client.query(convexInternal.conversations.getPromptHistoryForInbound, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          inboundTimestamp: input.inboundTimestamp,
          limit: input.limit,
          ...(input.currentTransportMessageId ? { currentTransportMessageId: input.currentTransportMessageId } : {}),
          ...(input.referencedTransportMessageId
            ? { referencedTransportMessageId: input.referencedTransportMessageId }
            : {}),
        })
      ),
    listRecentMessages: (input) =>
      withClient((client) =>
        client.query(convexInternal.conversations.listConversationMessages, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          limit: input.limit,
        })
      ),
    recordAnalyticsEvent: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.analytics.recordEvent, {
          companyId: toCompanyId(input.companyId),
          eventType: input.eventType,
          timestamp: input.timestamp,
          ...(input.payload ? { payload: input.payload } : {}),
        })
      ).then(() => undefined),
    trimConversationMessages: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.trimConversationMessages, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          maxMessages: input.maxMessages,
        })
      ),
  };
};
