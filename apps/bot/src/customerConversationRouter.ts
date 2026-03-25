import type { CatalogChatOrchestrator } from '@cs/rag';
import { canonicalizePhoneNumber, type ConversationMessageDto, type NormalizedInboundMessage } from '@cs/shared';
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

const formatOwnerNotification = (
  input: {
    companyName: string;
    customerPhoneNumber: string;
    history: ConversationMessageDto[];
    source: "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback";
  },
): string => {
  const sourceLabel =
    input.source === "assistant_action"
      ? "assistant handoff action"
      : input.source === "provider_failure_fallback"
        ? "provider failure fallback"
        : "invalid model output fallback";

  const historyLines = input.history.length === 0
    ? ["- No prior conversation history available"]
    : input.history.map((entry) => `- ${entry.role === "user" ? "Customer" : "Assistant"}: ${entry.content}`);

  return [
    `Handoff started for ${input.companyName}.`,
    `Customer: ${input.customerPhoneNumber}`,
    `Trigger: ${sourceLabel}`,
    "Auto-resume: 12 hours after the customer's last message while muted.",
    "Recent conversation:",
    ...historyLines,
  ].join("\n");
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
    let wasMuted = false;
    try {
      const conversation = await options.conversationStore.getOrCreateConversationForInbound(
        message.companyId,
        message.conversationPhoneNumber,
      );
      conversationId = conversation.id;
      wasMuted = conversation.muted;

      if (wasMuted) {
        await options.conversationStore.appendMutedCustomerMessage({
          companyId: message.companyId,
          conversationId,
          content: userMessage,
          timestamp: message.occurredAtMs,
        });
        return;
      }

      await options.conversationStore.appendUserMessage({
        companyId: message.companyId,
        conversationId,
        content: userMessage,
        timestamp: message.occurredAtMs,
      });

      history = await options.conversationStore.getPromptHistory({
        companyId: message.companyId,
        conversationId,
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
    try {
      if (handoffSource) {
        await options.conversationStore.appendAssistantMessageAndStartHandoff({
          companyId: message.companyId,
          conversationId,
          content: assistantText,
          timestamp: assistantTimestamp,
          source: handoffSource,
        });
      } else {
        await options.conversationStore.appendAssistantMessage({
          companyId: message.companyId,
          conversationId,
          content: assistantText,
          timestamp: assistantTimestamp,
        });
      }
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

    try {
      await context.outbound.sendText({
        recipientJid: `${message.sender.phoneNumber}@s.whatsapp.net`,
        text: assistantText,
      });
    } catch (error) {
      options.logger.error(
        {
          assistantText,
          companyId: message.companyId,
          conversationId,
          error,
          messageId: message.messageId,
          recipientPhoneNumber: message.sender.phoneNumber,
          sessionKey: message.sessionKey,
        },
        "customer conversation outbound send failed",
      );
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
            ownerPhone: context.profile.ownerPhone,
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
        } catch (error) {
          options.logger.error(
            {
              companyId: message.companyId,
              conversationId,
              error,
              handoffSource,
              ownerPhoneNumber,
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
