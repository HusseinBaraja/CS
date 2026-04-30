import type { ConversationSessionLogWriter } from "@cs/core";
import { type ConvexAdminClient, convexInternal } from "@cs/db";
import {
  type ConversationMessageDto,
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
    analyticsState?: "pending" | "recorded" | "completed" | "not_applicable";
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
        companyId: sideEffectInput.companyId as never,
        conversationId: sideEffectInput.conversationId as never,
        pendingMessageId: sideEffectInput.pendingMessageId as never,
        analyticsCompleted: true,
      });
    },
    completeOwnerNotification: async () => undefined,
    getOwnerNotificationContext: async () => null,
    listRecentMessages: async () => [],
    recordAnalytics: async (sideEffectInput) => {
      await client.mutation(convexInternal.analytics.recordEvent, {
        companyId: sideEffectInput.companyId as never,
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
        companyId: sideEffectInput.companyId as never,
        conversationId: sideEffectInput.conversationId as never,
        pendingMessageId: sideEffectInput.pendingMessageId as never,
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
    ownerNotificationState?: "pending" | "sent" | "completed" | "not_applicable";
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
        companyId: sideEffectInput.companyId as never,
        conversationId: sideEffectInput.conversationId as never,
        pendingMessageId: sideEffectInput.pendingMessageId as never,
        ownerNotificationCompleted: true,
      });
    },
    getOwnerNotificationContext: async () =>
      input.ownerContext !== undefined
        ? input.ownerContext
        : client.query(convexInternal.conversations.getConversationOwnerNotificationContext, {
          companyId: input.companyId as never,
          conversationId: input.conversationId as never,
        }),
    listRecentMessages: (sideEffectInput) =>
      client.query(convexInternal.conversations.listConversationMessages, {
        companyId: sideEffectInput.companyId as never,
        conversationId: sideEffectInput.conversationId as never,
        limit: sideEffectInput.limit,
      }) as Promise<ConversationMessageDto[]>,
    recordAnalytics: async () => undefined,
    recordAnalyticsProgress: async () => undefined,
    recordOwnerNotificationProgress: async (sideEffectInput) => {
      await client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
        companyId: sideEffectInput.companyId as never,
        conversationId: sideEffectInput.conversationId as never,
        pendingMessageId: sideEffectInput.pendingMessageId as never,
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
