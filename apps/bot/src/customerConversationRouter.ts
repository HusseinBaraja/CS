import { logEvent, serializeErrorForLog, type StructuredLogger, withLogBindings } from '@cs/core';
import type { CatalogChatOrchestrator } from '@cs/rag';
import type { NormalizedInboundMessage } from '@cs/shared';
import type { ConversationSessionLogWriter } from '@cs/core';
import type { ConversationStore } from './conversationStore';
import {
  createConversationTurnProcessor,
  type ConversationTurnContext,
} from './conversationTurn';
import type { InboundRouteContext } from './sessionManager';

type CustomerConversationLogger = StructuredLogger;

interface CustomerConversationRouterOptions {
  catalogChatOrchestrator: CatalogChatOrchestrator;
  conversationHistoryWindowMessages?: number;
  conversationSessionLog?: ConversationSessionLogWriter;
  conversationStore: ConversationStore;
  logger: CustomerConversationLogger;
  now?: () => number;
}

const hasOutbound = (context: InboundRouteContext): context is ConversationTurnContext =>
  Boolean(context.outbound);

export const createCustomerConversationRouter = (
  options: CustomerConversationRouterOptions,
): ((message: NormalizedInboundMessage, context: InboundRouteContext) => Promise<void>) => {
  const processConversationTurn = createConversationTurnProcessor(options);

  return async (message, context): Promise<void> => {
    if (hasOutbound(context)) {
      await processConversationTurn(message, context);
      return;
    }

    const routeLogger = withLogBindings(options.logger, {
      companyId: message.companyId,
      requestId: message.messageId,
      runtime: "bot",
      sessionKey: message.sessionKey,
      surface: "router",
    });

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
  };
};
