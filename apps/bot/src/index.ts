import {
  createConversationSessionLog,
  logError,
  logger,
} from '@cs/core';
import { createCatalogChatOrchestrator } from '@cs/rag';
import { createConvexConversationStore } from './conversationStore';
import { createCustomerConversationRouter } from './customerConversationRouter';
import { createBotRuntimeConfig } from './runtimeConfig';
import { startTenantSessionManager } from './sessionManager';

const runtimeConfig = createBotRuntimeConfig();
const conversationSessionLog = process.env.CONVERSATION_LOG_SESSION_ID && process.env.CONVERSATION_LOG_SESSION_PATH
  ? createConversationSessionLog({
    filePath: process.env.CONVERSATION_LOG_SESSION_PATH,
    sessionId: process.env.CONVERSATION_LOG_SESSION_ID,
  })
  : undefined;

const inboundRouter = {
  handleCustomerConversation: createCustomerConversationRouter({
    catalogChatOrchestrator: createCatalogChatOrchestrator(),
    conversationHistoryWindowMessages: runtimeConfig.conversationHistoryWindowMessages,
    conversationSessionLog,
    conversationStore: createConvexConversationStore(),
    logger,
  }),
  handleIgnored: async () => undefined,
  handleOwnerCommand: async () => undefined,
};

export const startBotApp = async (
  start = startTenantSessionManager,
  activeLogger = logger,
): Promise<void> => {
  try {
    await start({ inboundRouter });
  } catch (error) {
    logError(activeLogger, error, "bot startup failed", {
      envelopeOverrides: {
        event: "bot.runtime.startup_failed",
        runtime: "bot",
        surface: "runtime",
        outcome: "failed",
      },
    });
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  void startBotApp();
}
