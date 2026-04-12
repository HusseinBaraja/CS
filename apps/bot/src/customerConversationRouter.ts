import type { CatalogChatOrchestrator } from '@cs/rag';
import {
  logEvent,
  redactJidForLog,
  redactPhoneLikeValue,
  serializeErrorForLog,
  summarizeTextForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import {
  canonicalizePhoneNumber,
  formatOwnerNotification,
  type NormalizedInboundMessage,
} from '@cs/shared';
import type { InboundRouteContext } from './sessionManager';
import { toCompanyId, type ConversationStore } from './conversationStore';

export type CustomerConversationLogger = StructuredLogger;

export interface CustomerConversationRouterOptions {
  catalogChatOrchestrator: CatalogChatOrchestrator;
  conversationHistoryWindowMessages?: number;
  conversationStore: ConversationStore;
  logger: CustomerConversationLogger;
  now?: () => number;
}

const DEFAULT_CONVERSATION_HISTORY_WINDOW_MESSAGES = 20;
const OWNER_HANDOFF_HISTORY_LIMIT = 6;

const summarizeAssistantText = (value: string) => {
  const summary = summarizeTextForLog(value);

  return {
    assistantTextLength: summary.textLength,
    assistantTextLineCount: summary.textLineCount,
  };
};

const summarizeUserText = (value: string) => {
  const summary = summarizeTextForLog(value);

  return {
    userTextLength: summary.textLength,
    userTextLineCount: summary.textLineCount,
  };
};

const getAnalyticsIdempotencyKey = (pendingMessageId: string): string =>
  `pendingMessage:${pendingMessageId}:handoff_started`;

const serializeInboundMessage = (message: NormalizedInboundMessage): string => {
  const text = message.content.text.trim();

  switch (message.content.kind) {
    case "text":
      return text;
    case "image":
      return text.length > 0 ? `[image] ${text}` : "[image]";
    case "video":
      return text.length > 0 ? `[video] ${text}` : "[video]";
    case "document":
      return text.length > 0 ? `[document] ${text}` : "[document]";
    case "audio":
      return "[audio]";
    case "sticker":
      return "[sticker]";
  }
};

export const createCustomerConversationRouter = (
  options: CustomerConversationRouterOptions,
): ((message: NormalizedInboundMessage, context: InboundRouteContext) => Promise<void>) => {
  const now = options.now ?? Date.now;
  const conversationHistoryWindowMessages =
    options.conversationHistoryWindowMessages ?? DEFAULT_CONVERSATION_HISTORY_WINDOW_MESSAGES;

  return async (message, context): Promise<void> => {
    let routeLogger = withLogBindings(options.logger, {
      companyId: message.companyId,
      requestId: message.messageId,
      runtime: "bot",
      sessionKey: message.sessionKey,
      surface: "router",
    });

    if (!context.outbound) {
      logEvent(
        routeLogger,
        "error",
        {
          event: "bot.router.outbound_unavailable",
          runtime: "bot",
          surface: "router",
          outcome: "error",
          companyId: message.companyId,
          conversationPhoneNumber: message.conversationPhoneNumber,
          error: serializeErrorForLog(new Error("Outbound messenger unavailable")),
          messageId: message.messageId,
          sessionKey: message.sessionKey,
        },
        "customer conversation outbound messenger unavailable",
      );
      return;
    }

    const userMessage = serializeInboundMessage(message);
    let conversationId: string;
    let history: Awaited<ReturnType<ConversationStore["getPromptHistoryForInbound"]>>;
    try {
      const inboundAppend = await options.conversationStore.appendInboundCustomerMessage({
        companyId: message.companyId,
        phoneNumber: message.conversationPhoneNumber,
        content: userMessage,
        timestamp: message.occurredAtMs,
        transportMessageId: message.messageId,
        ...(message.replyContext?.referencedMessageId
          ? { referencedTransportMessageId: message.replyContext.referencedMessageId }
          : {}),
      });
      conversationId = inboundAppend.conversation.id;
      routeLogger = withLogBindings(routeLogger, {
        conversationId,
      });

      if (inboundAppend.wasDuplicate || inboundAppend.wasMuted) {
        logEvent(
          routeLogger,
          "info",
          {
            event: "bot.router.inbound_persisted",
            runtime: "bot",
            surface: "router",
            outcome: inboundAppend.wasDuplicate ? "duplicate" : "muted",
            companyId: message.companyId,
            conversationId,
            messageId: message.messageId,
            pendingMessageId: undefined,
            sessionKey: message.sessionKey,
            ...summarizeUserText(userMessage),
          },
          "customer conversation inbound message recorded",
        );
        return;
      }

      logEvent(
        routeLogger,
        "info",
        {
          event: "bot.router.inbound_persisted",
          runtime: "bot",
          surface: "router",
          outcome: "accepted",
          companyId: message.companyId,
          conversationId,
          messageId: message.messageId,
          sessionKey: message.sessionKey,
          ...summarizeUserText(userMessage),
        },
        "customer conversation inbound message recorded",
      );

      history = await options.conversationStore.getPromptHistoryForInbound({
        companyId: message.companyId,
        conversationId,
        inboundTimestamp: message.occurredAtMs,
        currentTransportMessageId: message.messageId,
        ...(message.replyContext?.referencedMessageId
          ? { referencedTransportMessageId: message.replyContext.referencedMessageId }
          : {}),
        limit: conversationHistoryWindowMessages,
      });
    } catch (error) {
      logEvent(
        routeLogger,
        "error",
        {
          companyId: message.companyId,
          conversationPhoneNumber: message.conversationPhoneNumber,
          error: serializeErrorForLog(error),
          event: "bot.router.persistence_failed",
          messageId: message.messageId,
          outcome: "error",
          runtime: "bot",
          sessionKey: message.sessionKey,
          surface: "router",
        },
        "customer conversation persistence failed",
      );
      return;
    }

    let assistantText: string;
    let handoffSource: "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback" | null = null;
    try {
      const response = await options.catalogChatOrchestrator.respond({
        tenant: {
          companyId: toCompanyId(message.companyId),
        },
        conversation: {
          conversationId,
          history,
        },
        logger: routeLogger,
        requestId: message.messageId,
        userMessage,
      });
      assistantText = response.assistant.text;
      if (response.assistant.action.type === "handoff") {
        handoffSource = "assistant_action";
      } else if (
        response.outcome === "provider_failure_fallback" ||
        response.outcome === "invalid_model_output_fallback"
      ) {
        handoffSource = response.outcome === "provider_failure_fallback"
          ? "provider_failure_fallback"
          : "invalid_model_output_fallback";
      }
    } catch (error) {
      logEvent(
        routeLogger,
        "error",
        {
          companyId: message.companyId,
          conversationId,
          error: serializeErrorForLog(error),
          event: "bot.router.orchestration_failed",
          messageId: message.messageId,
          outcome: "error",
          runtime: "bot",
          sessionKey: message.sessionKey,
          surface: "router",
        },
        "customer conversation orchestration failed",
      );
      return;
    }

    const assistantTimestamp = now();
    let pendingMessageId: string;
    try {
      const pendingMessage = await options.conversationStore.appendPendingAssistantMessage({
        companyId: message.companyId,
        conversationId,
        content: assistantText,
        timestamp: assistantTimestamp,
        ...(handoffSource ? { source: handoffSource } : {}),
      });
      pendingMessageId = pendingMessage.id;
      logEvent(
        routeLogger,
        "info",
        {
          event: "bot.router.assistant_pending_created",
          runtime: "bot",
          surface: "router",
          outcome: "pending",
          companyId: message.companyId,
          conversationId,
          messageId: message.messageId,
          pendingMessageId,
          sessionKey: message.sessionKey,
          ...(handoffSource ? { handoffSource } : {}),
          ...summarizeAssistantText(assistantText),
        },
        "customer conversation assistant reply queued",
      );
    } catch (error) {
      logEvent(
        routeLogger,
        "error",
        {
          ...summarizeAssistantText(assistantText),
          companyId: message.companyId,
          conversationId,
          error: serializeErrorForLog(error),
          event: "bot.router.assistant_persistence_failed",
          messageId: message.messageId,
          outcome: "error",
          runtime: "bot",
          sessionKey: message.sessionKey,
          surface: "router",
        },
        "customer conversation assistant persistence failed",
      );
      return;
    }

    let outboundMessageId: string | undefined;
    try {
      const sendReceipts = await context.outbound.sendText({
        logger: routeLogger,
        recipientJid: `${message.sender.phoneNumber}@s.whatsapp.net`,
        text: assistantText,
      });
      outboundMessageId = sendReceipts[0]?.messageId;
    } catch (error) {
      logEvent(
        routeLogger,
        "error",
        {
          ...summarizeAssistantText(assistantText),
          companyId: message.companyId,
          conversationId,
          error: serializeErrorForLog(error),
          event: "bot.router.outbound_send_failed",
          messageId: message.messageId,
          outcome: "error",
          pendingMessageId,
          recipientJid: redactJidForLog(`${message.sender.phoneNumber}@s.whatsapp.net`),
          recipientPhoneNumber: redactPhoneLikeValue(message.sender.phoneNumber),
          runtime: "bot",
          sessionKey: message.sessionKey,
          surface: "router",
        },
        "customer conversation outbound send failed",
      );
      try {
        await options.conversationStore.markPendingAssistantMessageFailed({
          companyId: message.companyId,
          conversationId,
          pendingMessageId,
        });
      } catch (markFailedError) {
        logEvent(
          routeLogger,
          "error",
          {
            companyId: message.companyId,
            conversationId,
            error: serializeErrorForLog(markFailedError),
            event: "bot.router.pending_failure_persistence_failed",
            messageId: message.messageId,
            outcome: "error",
            pendingMessageId,
            runtime: "bot",
            sessionKey: message.sessionKey,
            surface: "router",
          },
          "customer conversation pending assistant failure persistence failed",
        );
      }
      return;
    }

    try {
      await options.conversationStore.acknowledgePendingAssistantMessage({
        companyId: message.companyId,
        conversationId,
        pendingMessageId,
        acknowledgedAt: now(),
        ...(outboundMessageId ? { transportMessageId: outboundMessageId } : {}),
      });
    } catch (error) {
      logEvent(
        routeLogger,
        "error",
        {
          ...summarizeAssistantText(assistantText),
          companyId: message.companyId,
          conversationId,
          error: serializeErrorForLog(error),
          event: "bot.router.assistant_acknowledgement_failed",
          messageId: message.messageId,
          outboundMessageId,
          outcome: "error",
          pendingMessageId,
          runtime: "bot",
          sessionKey: message.sessionKey,
          surface: "router",
        },
        "customer conversation assistant acknowledgement persistence failed",
      );
      return;
    }

    try {
      await options.conversationStore.commitPendingAssistantMessage({
        companyId: message.companyId,
        conversationId,
        pendingMessageId,
        ...(outboundMessageId ? { transportMessageId: outboundMessageId } : {}),
      });
    } catch (error) {
      logEvent(
        routeLogger,
        "error",
        {
          ...summarizeAssistantText(assistantText),
          companyId: message.companyId,
          conversationId,
          error: serializeErrorForLog(error),
          event: "bot.router.assistant_commit_failed",
          messageId: message.messageId,
          outcome: "error",
          pendingMessageId,
          runtime: "bot",
          sessionKey: message.sessionKey,
          surface: "router",
        },
        "customer conversation assistant persistence failed",
      );
      return;
    }

    logEvent(
      routeLogger,
      "info",
      {
        event: "bot.router.assistant_committed",
        runtime: "bot",
        surface: "router",
        outcome: handoffSource ? "handoff" : "sent",
        companyId: message.companyId,
        conversationId,
        messageId: message.messageId,
        ...(outboundMessageId ? { outboundMessageId } : {}),
        pendingMessageId,
        sessionKey: message.sessionKey,
        ...(handoffSource ? { handoffSource } : {}),
        ...summarizeAssistantText(assistantText),
      },
      "customer conversation assistant reply committed",
    );

    if (handoffSource) {
      try {
        await options.conversationStore.recordAnalyticsEvent({
          companyId: message.companyId,
          eventType: "handoff_started",
          idempotencyKey: getAnalyticsIdempotencyKey(pendingMessageId),
          timestamp: assistantTimestamp,
          payload: {
            conversationId,
            phoneNumber: message.conversationPhoneNumber,
            source: handoffSource,
          },
        });
        await options.conversationStore.recordPendingAssistantSideEffectProgress({
          companyId: message.companyId,
          conversationId,
          pendingMessageId,
          analyticsRecorded: true,
        });
        await options.conversationStore.completePendingAssistantSideEffects({
          companyId: message.companyId,
          conversationId,
          pendingMessageId,
          analyticsCompleted: true,
        });
      } catch (error) {
        logEvent(
          routeLogger,
          "error",
          {
            companyId: message.companyId,
            conversationId,
            error: serializeErrorForLog(error),
            event: "bot.router.handoff_analytics_failed",
            handoffSource,
            messageId: message.messageId,
            outcome: "error",
            runtime: "bot",
            sessionKey: message.sessionKey,
            surface: "router",
          },
          "customer conversation handoff analytics failed",
        );
      }

      const ownerPhoneNumber = canonicalizePhoneNumber(context.profile.ownerPhone);
      if (!ownerPhoneNumber) {
        logEvent(
          routeLogger,
          "error",
          {
            companyId: message.companyId,
            conversationId,
            event: "bot.router.owner_phone_unavailable",
            outcome: "error",
            ownerPhone: redactPhoneLikeValue(context.profile.ownerPhone),
            runtime: "bot",
            sessionKey: message.sessionKey,
            surface: "router",
          },
          "customer conversation owner phone unavailable for handoff notification",
        );
      } else {
        try {
          const recentMessages = await options.conversationStore.listRecentMessages({
            companyId: message.companyId,
            conversationId,
            limit: OWNER_HANDOFF_HISTORY_LIMIT,
          });

          await context.outbound.sendText({
            logger: routeLogger,
            recipientJid: `${ownerPhoneNumber}@s.whatsapp.net`,
            text: formatOwnerNotification({
              companyName: context.profile.name,
              customerPhoneNumber: message.conversationPhoneNumber,
              history: recentMessages,
              source: handoffSource,
            }),
          });
          await options.conversationStore.recordPendingAssistantSideEffectProgress({
            companyId: message.companyId,
            conversationId,
            pendingMessageId,
            ownerNotificationSent: true,
          });
          await options.conversationStore.completePendingAssistantSideEffects({
            companyId: message.companyId,
            conversationId,
            pendingMessageId,
            ownerNotificationCompleted: true,
          });
        } catch (error) {
          logEvent(
            routeLogger,
            "error",
            {
              companyId: message.companyId,
              conversationId,
              error: serializeErrorForLog(error),
              event: "bot.router.owner_notification_failed",
              handoffSource,
              outcome: "error",
              ownerPhoneNumber: redactPhoneLikeValue(ownerPhoneNumber),
              messageId: message.messageId,
              runtime: "bot",
              sessionKey: message.sessionKey,
              surface: "router",
            },
            "customer conversation owner handoff notification failed",
          );
        }
      }
    }

    try {
      await options.conversationStore.trimConversationMessages({
        companyId: message.companyId,
        conversationId,
        maxMessages: conversationHistoryWindowMessages,
      });
    } catch (error) {
      logEvent(
        routeLogger,
        "error",
        {
          ...summarizeAssistantText(assistantText),
          companyId: message.companyId,
          conversationId,
          error: serializeErrorForLog(error),
          event: "bot.router.history_trim_failed",
          messageId: message.messageId,
          outcome: "error",
          runtime: "bot",
          sessionKey: message.sessionKey,
          surface: "router",
        },
        "customer conversation history trimming failed",
      );
    }
  };
};
