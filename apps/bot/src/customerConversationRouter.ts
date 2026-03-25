import type { CatalogChatOrchestrator } from '@cs/rag';
import {
  canonicalizePhoneNumber,
  formatOwnerNotification,
  type NormalizedInboundMessage,
} from '@cs/shared';
import type { InboundRouteContext } from './sessionManager';
import { toCompanyId, type ConversationStore } from './conversationStore';

export interface CustomerConversationLogger {
  error(payload: unknown, message: string): void;
}

export interface CustomerConversationRouterOptions {
  catalogChatOrchestrator: CatalogChatOrchestrator;
  conversationHistoryWindowMessages?: number;
  conversationStore: ConversationStore;
  logger: CustomerConversationLogger;
  now?: () => number;
}

const DEFAULT_CONVERSATION_HISTORY_WINDOW_MESSAGES = 20;
const OWNER_HANDOFF_HISTORY_LIMIT = 6;

const redactPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) {
    return "[redacted]";
  }

  const suffix = digits.slice(-4);
  return `***${suffix}`;
};

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
    if (!context.outbound) {
      options.logger.error(
        {
          companyId: message.companyId,
          conversationPhoneNumber: message.conversationPhoneNumber,
          messageId: message.messageId,
          sessionKey: message.sessionKey,
        },
        "customer conversation outbound messenger unavailable",
      );
      return;
    }

    const userMessage = serializeInboundMessage(message);
    let conversationId: string;
    let history;
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

      if (inboundAppend.wasDuplicate || inboundAppend.wasMuted) {
        return;
      }

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
      options.logger.error(
        {
          companyId: message.companyId,
          conversationPhoneNumber: message.conversationPhoneNumber,
          error,
          messageId: message.messageId,
          sessionKey: message.sessionKey,
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
      options.logger.error(
        {
          companyId: message.companyId,
          conversationId,
          error,
          messageId: message.messageId,
          sessionKey: message.sessionKey,
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
    } catch (error) {
      options.logger.error(
        {
          assistantText,
          companyId: message.companyId,
          conversationId,
          error,
          messageId: message.messageId,
          sessionKey: message.sessionKey,
        },
        "customer conversation assistant persistence failed",
      );
      return;
    }

    let outboundMessageId: string | undefined;
    try {
      const sendReceipts = await context.outbound.sendText({
        recipientJid: `${message.sender.phoneNumber}@s.whatsapp.net`,
        text: assistantText,
      });
      outboundMessageId = sendReceipts[0]?.messageId;
    } catch (error) {
      options.logger.error(
        {
          assistantText,
          companyId: message.companyId,
          conversationId,
          error,
          messageId: message.messageId,
          pendingMessageId,
          recipientPhoneNumber: redactPhoneNumber(message.sender.phoneNumber),
          sessionKey: message.sessionKey,
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
        options.logger.error(
          {
            companyId: message.companyId,
            conversationId,
            error: markFailedError,
            messageId: message.messageId,
            pendingMessageId,
            sessionKey: message.sessionKey,
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
      options.logger.error(
        {
          assistantText,
          companyId: message.companyId,
          conversationId,
          error,
          messageId: message.messageId,
          outboundMessageId,
          pendingMessageId,
          sessionKey: message.sessionKey,
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
      options.logger.error(
        {
          assistantText,
          companyId: message.companyId,
          conversationId,
          error,
          messageId: message.messageId,
          pendingMessageId,
          sessionKey: message.sessionKey,
        },
        "customer conversation assistant persistence failed",
      );
      return;
    }

    if (handoffSource) {
      try {
        await options.conversationStore.recordAnalyticsEvent({
          companyId: message.companyId,
          eventType: "handoff_started",
          timestamp: assistantTimestamp,
          payload: {
            conversationId,
            phoneNumber: message.conversationPhoneNumber,
            source: handoffSource,
          },
        });
        await options.conversationStore.completePendingAssistantSideEffects({
          companyId: message.companyId,
          conversationId,
          pendingMessageId,
          analyticsCompleted: true,
        });
      } catch (error) {
        options.logger.error(
          {
            companyId: message.companyId,
            conversationId,
            error,
            handoffSource,
            messageId: message.messageId,
            sessionKey: message.sessionKey,
          },
          "customer conversation handoff analytics failed",
        );
      }

      const ownerPhoneNumber = canonicalizePhoneNumber(context.profile.ownerPhone);
      if (!ownerPhoneNumber) {
        options.logger.error(
          {
            companyId: message.companyId,
            conversationId,
            ownerPhone: redactPhoneNumber(context.profile.ownerPhone),
            sessionKey: message.sessionKey,
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
            recipientJid: `${ownerPhoneNumber}@s.whatsapp.net`,
            text: formatOwnerNotification({
              companyName: context.profile.name,
              customerPhoneNumber: message.conversationPhoneNumber,
              history: recentMessages,
              source: handoffSource,
            }),
          });
          await options.conversationStore.completePendingAssistantSideEffects({
            companyId: message.companyId,
            conversationId,
            pendingMessageId,
            ownerNotificationCompleted: true,
          });
        } catch (error) {
          options.logger.error(
            {
              companyId: message.companyId,
              conversationId,
              error,
              handoffSource,
              ownerPhoneNumber: redactPhoneNumber(ownerPhoneNumber),
              messageId: message.messageId,
              sessionKey: message.sessionKey,
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
      options.logger.error(
        {
          assistantText,
          companyId: message.companyId,
          conversationId,
          error,
          messageId: message.messageId,
          sessionKey: message.sessionKey,
        },
        "customer conversation history trimming failed",
      );
    }
  };
};
