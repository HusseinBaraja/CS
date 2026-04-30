import { describe, expect, test } from 'bun:test';
import type { CatalogChatOrchestrator } from '@cs/rag';
import type { NormalizedInboundMessage } from '@cs/shared';
import { createCustomerConversationRouter } from './customerConversationRouter';
import type { ConversationStore } from './conversationStore';
import type { InboundRouteContext } from './sessionManager';

const createMessage = (): NormalizedInboundMessage => ({
  transport: "whatsapp",
  companyId: "company-1",
  sessionKey: "session-1",
  messageId: "message-1",
  occurredAtMs: 1_700_000_000_000,
  conversationPhoneNumber: "967700000001",
  sender: {
    phoneNumber: "967700000001",
    transportId: "967700000001@s.whatsapp.net",
    role: "customer",
  },
  content: {
    kind: "text",
    text: "hello",
    hasMedia: false,
  },
  source: {
    upsertType: "notify",
  },
});

const createContext = (): InboundRouteContext => ({
  logger: (() => {
    const stub: InboundRouteContext["logger"] = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => stub,
    };
    return stub;
  })(),
  profile: {
    companyId: "company-1",
    name: "Tenant 1",
    ownerPhone: "966500000000",
    sessionKey: "session-1",
    timezone: "UTC",
  },
});

const createLogger = () => {
  const errorCalls: Array<{ payload: unknown; message: string }> = [];

  return {
    logger: {
      debug: () => undefined,
      error: (payload: unknown, message: string) => {
        errorCalls.push({ payload, message });
      },
      warn: () => undefined,
      info: () => undefined,
    },
    errorCalls,
  };
};

describe("createCustomerConversationRouter", () => {
  test("logs and stops before Conversation Turn when outbound is unavailable", async () => {
    let usedTurnDependencies = false;
    const store = {
      appendInboundCustomerMessage: async () => {
        usedTurnDependencies = true;
        throw new Error("should not run");
      },
    } as unknown as ConversationStore;
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => {
        usedTurnDependencies = true;
        throw new Error("should not run");
      },
    };
    const { logger, errorCalls } = createLogger();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext());

    expect(usedTurnDependencies).toBe(false);
    expect(errorCalls[0]?.message).toBe("customer conversation outbound messenger unavailable");
  });
});
