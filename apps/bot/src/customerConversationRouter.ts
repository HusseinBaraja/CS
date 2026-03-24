import type { CatalogChatOrchestrator } from '@cs/rag';
import type { NormalizedInboundMessage } from '@cs/shared';
import type { InboundRouteContext } from './sessionManager';
import type { ConversationStore } from './conversationStore';

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
      const conversation = await options.conversationStore.getOrCreateActiveConversation(
        message.companyId,
        message.conversationPhoneNumber,
      );
      conversationId = conversation.id;

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
    try {
      const response = await options.catalogChatOrchestrator.respond({
        tenant: {
          companyId: message.companyId as never,
        },
        conversation: {
          conversationId,
          history,
        },
        requestId: message.messageId,
        userMessage,
      });
      assistantText = response.assistant.text;
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

    try {
      await options.conversationStore.appendAssistantMessage({
        companyId: message.companyId,
        conversationId,
        content: assistantText,
        timestamp: now(),
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
        "customer conversation assistant persistence failed",
      );
      return;
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
  };
};
