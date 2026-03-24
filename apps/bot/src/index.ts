import { logger } from '@cs/core';
import { createCatalogChatOrchestrator } from '@cs/rag';
import { createConvexConversationStore } from './conversationStore';
import { createCustomerConversationRouter } from './customerConversationRouter';
import { startTenantSessionManager } from './sessionManager';

const inboundRouter = {
  handleCustomerConversation: createCustomerConversationRouter({
    catalogChatOrchestrator: createCatalogChatOrchestrator(),
    conversationStore: createConvexConversationStore(),
    logger,
  }),
  handleIgnored: async () => undefined,
  handleOwnerCommand: async () => undefined,
};

if (import.meta.main) {
  startTenantSessionManager({ inboundRouter }).catch((error) => {
    logger.error({ error }, "bot startup failed");
    process.exitCode = 1;
  });
}
