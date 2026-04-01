import type { PromptHistoryTurn } from '@cs/ai';
import type {
  AnalyticsEventType,
  CanonicalConversationStateDto,
  CanonicalConversationStateReadResultDto,
  ConversationMessageDto,
  PromptHistorySelection,
  ConversationRecordDto,
  ConversationLifecycleEventSource,
  PromptHistorySelectionMode,
  RetrievalOutcome,
} from '@cs/shared';
import { convexInternal, createConvexAdminClient, type ConvexAdminClient, type Id } from '@cs/db';
export type ConversationRecord = ConversationRecordDto;
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

export interface ApplyCanonicalConversationTurnOutcomeInput {
  companyId: string;
  conversationId: string;
  responseLanguage?: "ar" | "en";
  latestUserMessageText: string;
  assistantActionType: "none" | "clarify" | "handoff";
  committedAssistantTimestamp: number;
  promptHistorySelectionMode: PromptHistorySelectionMode;
  usedQuotedReference: boolean;
  referencedTransportMessageId?: string;
  retrievalOutcome: RetrievalOutcome;
  candidates: Array<{
    entityKind: "category" | "product" | "variant";
    entityId: string;
    score: number;
  }>;
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
    source?: Extract<ConversationLifecycleEventSource, "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback">;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<ConversationMessageRecord>;
  acknowledgePendingAssistantMessage(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
    acknowledgedAt: number;
    transportMessageId?: string;
  }): Promise<ConversationMessageRecord>;
  completePendingAssistantSideEffects(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
    analyticsCompleted?: boolean;
    ownerNotificationCompleted?: boolean;
  }): Promise<ConversationMessageRecord>;
  recordPendingAssistantSideEffectProgress(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
    analyticsRecorded?: boolean;
    ownerNotificationSent?: boolean;
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
    source: Extract<ConversationLifecycleEventSource, "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback">;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
    transportMessageId?: string;
  }): Promise<ConversationRecord>;
  startHandoff(input: {
    companyId: string;
    conversationId: string;
    triggerTimestamp: number;
    source: Extract<ConversationLifecycleEventSource, "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback">;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<ConversationRecord>;
  resumeConversation(input: {
    companyId: string;
    conversationId: string;
    resumedAt: number;
    source: Extract<ConversationLifecycleEventSource, "api_manual" | "worker_auto">;
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
  }): Promise<PromptHistorySelection<PromptHistoryTurn>>;
  getCanonicalConversationState(input: {
    companyId: string;
    conversationId: string;
    now?: number;
  }): Promise<CanonicalConversationStateReadResultDto>;
  applyCanonicalConversationTurnOutcome(
    input: ApplyCanonicalConversationTurnOutcomeInput,
  ): Promise<CanonicalConversationStateDto>;
  listRecentMessages(input: { companyId: string; conversationId: string; limit: number }): Promise<ConversationMessageRecord[]>;
  recordAnalyticsEvent(input: {
    companyId: string;
    eventType: AnalyticsEventType;
    timestamp: number;
    idempotencyKey?: string;
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
const TRANSIENT_CONVEX_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]);

const isTransientConvexStoreError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string };
  if (typeof errorWithCode.code === "string" && TRANSIENT_CONVEX_ERROR_CODES.has(errorWithCode.code)) {
    return true;
  }

  return error.message.includes("The socket connection was closed unexpectedly");
};

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

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      if (!isTransientConvexStoreError(error)) {
        throw error;
      }

      return callback(createClient());
    }
  };

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
    acknowledgePendingAssistantMessage: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.acknowledgePendingAssistantMessage, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          pendingMessageId: toMessageId(input.pendingMessageId),
          acknowledgedAt: input.acknowledgedAt,
          ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
        })
      ),
    completePendingAssistantSideEffects: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.completePendingAssistantSideEffects, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          pendingMessageId: toMessageId(input.pendingMessageId),
          ...(input.analyticsCompleted !== undefined ? { analyticsCompleted: input.analyticsCompleted } : {}),
          ...(input.ownerNotificationCompleted !== undefined
            ? { ownerNotificationCompleted: input.ownerNotificationCompleted }
            : {}),
        })
      ),
    recordPendingAssistantSideEffectProgress: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          pendingMessageId: toMessageId(input.pendingMessageId),
          ...(input.analyticsRecorded !== undefined ? { analyticsRecorded: input.analyticsRecorded } : {}),
          ...(input.ownerNotificationSent !== undefined ? { ownerNotificationSent: input.ownerNotificationSent } : {}),
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
    getCanonicalConversationState: (input) =>
      withClient((client) =>
        client.query(convexInternal.conversations.getCanonicalConversationState, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          ...(input.now !== undefined ? { now: input.now } : {}),
        })
      ),
    applyCanonicalConversationTurnOutcome: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.applyCanonicalConversationTurnOutcome, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          latestUserMessageText: input.latestUserMessageText,
          assistantActionType: input.assistantActionType,
          committedAssistantTimestamp: input.committedAssistantTimestamp,
          promptHistorySelectionMode: input.promptHistorySelectionMode,
          usedQuotedReference: input.usedQuotedReference,
          retrievalOutcome: input.retrievalOutcome,
          candidates: input.candidates,
          ...(input.responseLanguage ? { responseLanguage: input.responseLanguage } : {}),
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
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
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
