import type { ConversationSessionLogWriter } from "@cs/core";
import {
  type ConvexAdminClient,
  convexInternal,
  toCompanyId,
  toConversationId,
  toMessageId,
} from "@cs/db";
import {
  type AnalyticsHandoffState,
  type ConversationMessageDto,
  type OwnerNotificationHandoffState,
  runPendingHandoffSideEffects,
} from "@cs/shared";
import {
  appendAssistantAnalyticsReplayedSessionLog,
  appendAssistantOwnerNotificationReplayedSessionLog,
  isAssistantHandoffSource,
} from "./pendingAssistantSessionLog";

type OwnerNotificationSender = (input: { recipientJid: string; text: string }) => Promise<void>;

const toAssistantHandoffSource = (value: string | undefined) =>
  value && isAssistantHandoffSource(value) ? value : undefined;

export const replayPendingAssistantAnalyticsIfNeeded = async (
  client: ConvexAdminClient,
  input: {
    companyId: string;
    conversationId: string;
    conversationSessionLog?: ConversationSessionLogWriter;
    handoffSource?: string;
    messageId: string;
    phoneNumber: string;
    timestamp: number;
    analyticsState?: AnalyticsHandoffState;
  },
): Promise<void> => {
  const result = await runPendingHandoffSideEffects({
    companyId: input.companyId,
    conversationId: input.conversationId,
    customerPhoneNumber: input.phoneNumber,
    handoffSource: toAssistantHandoffSource(input.handoffSource),
    pendingMessageId: input.messageId,
    timestamp: input.timestamp,
    analyticsState: input.analyticsState,
    ownerNotificationState: "not_applicable",
    completeAnalytics: async (sideEffectInput) => {
      await client.mutation(convexInternal.conversations.completePendingAssistantSideEffects, {
        companyId: toCompanyId(sideEffectInput.companyId),
        conversationId: toConversationId(sideEffectInput.conversationId),
        pendingMessageId: toMessageId(sideEffectInput.pendingMessageId),
        analyticsCompleted: true,
      });
    },
    completeOwnerNotification: async () => undefined,
    getOwnerNotificationContext: async () => null,
    listRecentMessages: async () => [],
    recordAnalytics: async (sideEffectInput) => {
      await client.mutation(convexInternal.analytics.recordEvent, {
        companyId: toCompanyId(sideEffectInput.companyId),
        eventType: "handoff_started",
        timestamp: sideEffectInput.timestamp,
        idempotencyKey: sideEffectInput.idempotencyKey,
        payload: {
          conversationId: sideEffectInput.conversationId,
          phoneNumber: sideEffectInput.customerPhoneNumber,
          source: sideEffectInput.handoffSource,
        },
      });
    },
    recordAnalyticsProgress: async (sideEffectInput) => {
      await client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
        companyId: toCompanyId(sideEffectInput.companyId),
        conversationId: toConversationId(sideEffectInput.conversationId),
        pendingMessageId: toMessageId(sideEffectInput.pendingMessageId),
        analyticsRecorded: true,
      });
      await appendAssistantAnalyticsReplayedSessionLog(input.conversationSessionLog, {
        companyId: sideEffectInput.companyId,
        conversationId: sideEffectInput.conversationId,
        timestamp: input.timestamp,
      });
    },
    recordOwnerNotificationProgress: async () => undefined,
    sendOwnerNotification: async () => undefined,
  });

  const failure = result.failures[0];
  if (failure) {
    throw failure.error;
  }
};

export const replayPendingAssistantOwnerNotificationIfNeeded = async (
  client: ConvexAdminClient,
  input: {
    companyId: string;
    conversationId: string;
    conversationSessionLog?: ConversationSessionLogWriter;
    handoffSource?: string;
    messageId: string;
    ownerContext?: {
      companyName: string;
      ownerPhone: string;
    } | null;
    ownerNotificationState?: OwnerNotificationHandoffState;
    phoneNumber: string;
    timestamp: number;
  },
  sendOwnerNotification?: OwnerNotificationSender,
): Promise<void> => {
  const result = await runPendingHandoffSideEffects({
    companyId: input.companyId,
    conversationId: input.conversationId,
    customerPhoneNumber: input.phoneNumber,
    handoffSource: toAssistantHandoffSource(input.handoffSource),
    pendingMessageId: input.messageId,
    timestamp: input.timestamp,
    analyticsState: "not_applicable",
    ownerNotificationState: input.ownerNotificationState,
    completeAnalytics: async () => undefined,
    completeOwnerNotification: async (sideEffectInput) => {
      await client.mutation(convexInternal.conversations.completePendingAssistantSideEffects, {
        companyId: toCompanyId(sideEffectInput.companyId),
        conversationId: toConversationId(sideEffectInput.conversationId),
        pendingMessageId: toMessageId(sideEffectInput.pendingMessageId),
        ownerNotificationCompleted: true,
      });
    },
    getOwnerNotificationContext: async () =>
      input.ownerContext !== undefined
        ? input.ownerContext
        : client.query(convexInternal.conversations.getConversationOwnerNotificationContext, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
        }),
    listRecentMessages: (sideEffectInput) =>
      client.query(convexInternal.conversations.listConversationMessages, {
        companyId: toCompanyId(sideEffectInput.companyId),
        conversationId: toConversationId(sideEffectInput.conversationId),
        limit: sideEffectInput.limit,
      }) as Promise<ConversationMessageDto[]>,
    recordAnalytics: async () => undefined,
    recordAnalyticsProgress: async () => undefined,
    recordOwnerNotificationProgress: async (sideEffectInput) => {
      await client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
        companyId: toCompanyId(sideEffectInput.companyId),
        conversationId: toConversationId(sideEffectInput.conversationId),
        pendingMessageId: toMessageId(sideEffectInput.pendingMessageId),
        ownerNotificationSent: true,
      });
      await appendAssistantOwnerNotificationReplayedSessionLog(input.conversationSessionLog, {
        companyId: sideEffectInput.companyId,
        conversationId: sideEffectInput.conversationId,
        timestamp: input.timestamp,
      });
    },
    sendOwnerNotification: async (sideEffectInput) => {
      if (!sendOwnerNotification) {
        throw new Error("Pending assistant owner notification sender unavailable");
      }

      await sendOwnerNotification(sideEffectInput);
    },
  });

  const failure = result.failures[0];
  if (failure) {
    throw failure.error;
  }
};
