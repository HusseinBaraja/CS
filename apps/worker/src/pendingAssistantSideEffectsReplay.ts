import type { ConversationSessionLogWriter } from "@cs/core";
import { type ConvexAdminClient, convexInternal } from "@cs/db";
import {
  canonicalizePhoneNumber,
  formatOwnerNotification,
  getAnalyticsIdempotencyKey,
  type ConversationMessageDto,
} from "@cs/shared";
import {
  appendAssistantAnalyticsReplayedSessionLog,
  appendAssistantOwnerNotificationReplayedSessionLog,
  isAssistantHandoffSource,
} from "./pendingAssistantSessionLog";

type OwnerNotificationSender = (input: { recipientJid: string; text: string }) => Promise<void>;

const OWNER_HANDOFF_HISTORY_LIMIT = 6;

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
  if (
    (input.analyticsState !== "pending" && input.analyticsState !== "recorded")
    || !input.handoffSource
  ) {
    return;
  }

  if (input.analyticsState === "pending") {
    await client.mutation(convexInternal.analytics.recordEvent, {
      companyId: input.companyId as never,
      eventType: "handoff_started",
      timestamp: input.timestamp,
      idempotencyKey: getAnalyticsIdempotencyKey(input.messageId),
      payload: {
        conversationId: input.conversationId,
        phoneNumber: input.phoneNumber,
        source: input.handoffSource,
      },
    });
    await client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
      companyId: input.companyId as never,
      conversationId: input.conversationId as never,
      pendingMessageId: input.messageId as never,
      analyticsRecorded: true,
    });
    await appendAssistantAnalyticsReplayedSessionLog(input.conversationSessionLog, {
      companyId: input.companyId,
      conversationId: input.conversationId,
      timestamp: input.timestamp,
    });
  }

  await client.mutation(convexInternal.conversations.completePendingAssistantSideEffects, {
    companyId: input.companyId as never,
    conversationId: input.conversationId as never,
    pendingMessageId: input.messageId as never,
    analyticsCompleted: true,
  });
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
  if (input.ownerNotificationState !== "pending" && input.ownerNotificationState !== "sent") {
    return;
  }

  if (input.ownerNotificationState === "pending") {
    if (!input.handoffSource || !isAssistantHandoffSource(input.handoffSource)) {
      throw new Error("Pending assistant owner notification replay requires message.handoffSource");
    }

    if (!sendOwnerNotification) {
      throw new Error("Pending assistant owner notification sender unavailable");
    }

    const [ownerContext, recentMessages] = await Promise.all([
      input.ownerContext !== undefined
        ? Promise.resolve(input.ownerContext)
        : client.query(convexInternal.conversations.getConversationOwnerNotificationContext, {
          companyId: input.companyId as never,
          conversationId: input.conversationId as never,
        }),
      client.query(convexInternal.conversations.listConversationMessages, {
        companyId: input.companyId as never,
        conversationId: input.conversationId as never,
        limit: OWNER_HANDOFF_HISTORY_LIMIT,
      }) as Promise<ConversationMessageDto[]>,
    ]);
    const ownerPhoneNumber = ownerContext ? canonicalizePhoneNumber(ownerContext.ownerPhone) : null;

    if (!ownerContext || !ownerPhoneNumber) {
      throw new Error("Owner notification replay context unavailable");
    }

    await client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
      companyId: input.companyId as never,
      conversationId: input.conversationId as never,
      pendingMessageId: input.messageId as never,
      ownerNotificationSent: true,
    });
    await sendOwnerNotification({
      recipientJid: `${ownerPhoneNumber}@s.whatsapp.net`,
      text: formatOwnerNotification({
        companyName: ownerContext.companyName,
        customerPhoneNumber: input.phoneNumber,
        history: recentMessages,
        source: input.handoffSource,
      }),
    });
    await appendAssistantOwnerNotificationReplayedSessionLog(input.conversationSessionLog, {
      companyId: input.companyId,
      conversationId: input.conversationId,
      timestamp: input.timestamp,
    });
  }

  await client.mutation(convexInternal.conversations.completePendingAssistantSideEffects, {
    companyId: input.companyId as never,
    conversationId: input.conversationId as never,
    pendingMessageId: input.messageId as never,
    ownerNotificationCompleted: true,
  });
};
