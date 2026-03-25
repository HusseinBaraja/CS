import { describe, expect, test } from 'bun:test';
import type { CatalogChatOrchestrator } from '@cs/rag';
import type { NormalizedInboundMessage } from '@cs/shared';
import type { OutboundMessenger } from './outbound';
import { createCustomerConversationRouter } from './customerConversationRouter';
import type { ConversationStore } from './conversationStore';
import type { InboundRouteContext } from './sessionManager';

const createCatalogChatResult = (text: string, query = "hello") => ({
  outcome: "provider_response" as const,
  assistant: {
    schemaVersion: "v1" as const,
    text,
    action: { type: "none" as const },
  },
  language: {
    classification: "en" as const,
    responseLanguage: "en" as const,
    arabicCharCount: 0,
    englishCharCount: 5,
    hasArabic: false,
    hasEnglish: true,
  },
  retrieval: {
    outcome: "empty" as const,
    reason: "no_hits" as const,
    query,
    language: "en" as const,
    candidates: [],
    contextBlocks: [],
  },
});

const createMessage = (
  overrides: Partial<NormalizedInboundMessage> = {},
): NormalizedInboundMessage => ({
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
  ...overrides,
});

const createLogger = () => {
  const errorCalls: Array<{ payload: unknown; message: string }> = [];
  const warnCalls: Array<{ payload: unknown; message: string }> = [];
  const infoCalls: Array<{ payload: unknown; message: string }> = [];

  return {
    logger: {
      error: (payload: unknown, message: string) => {
        errorCalls.push({ payload, message });
      },
      warn: (payload: unknown, message: string) => {
        warnCalls.push({ payload, message });
      },
      info: (payload: unknown, message: string) => {
        infoCalls.push({ payload, message });
      },
    },
    errorCalls,
    warnCalls,
    infoCalls,
  };
};

const createOutbound = () => {
  const sent: Array<{ recipientJid: string; text: string }> = [];
  const outbound: OutboundMessenger = {
    sendMedia: async () => [],
    sendSequence: async () => [],
    sendText: async (input) => {
      sent.push({
        recipientJid: input.recipientJid,
        text: typeof input.text === "string" ? input.text : "",
      });
      return [];
    },
  };

  return { outbound, sent };
};

const createContext = (outbound?: OutboundMessenger): InboundRouteContext => ({
  profile: {
    companyId: "company-1",
    name: "Tenant 1",
    ownerPhone: "966500000000",
    sessionKey: "session-1",
    timezone: "UTC",
  },
  ...(outbound ? { outbound } : {}),
});

const createStore = (overrides: Partial<ConversationStore> = {}): ConversationStore => ({
  appendAssistantMessage: async (input) => ({
    id: "assistant-message",
    conversationId: input.conversationId,
    role: "assistant",
    content: input.content,
    timestamp: input.timestamp,
  }),
  appendAssistantMessageAndStartHandoff: async (input) => ({
    id: input.conversationId,
    companyId: input.companyId,
    phoneNumber: "967700000001",
    muted: true,
    mutedAt: input.timestamp,
    lastCustomerMessageAt: input.timestamp,
    nextAutoResumeAt: input.timestamp + 1_000,
  }),
  appendUserMessage: async (input) => ({
    id: "user-message",
    conversationId: input.conversationId,
    role: "user",
    content: input.content,
    timestamp: input.timestamp,
  }),
  appendMutedCustomerMessage: async (input) => ({
    id: input.conversationId,
    companyId: input.companyId,
    phoneNumber: "967700000001",
    muted: true,
    mutedAt: 1_000,
    lastCustomerMessageAt: input.timestamp,
    nextAutoResumeAt: input.timestamp + 1_000,
  }),
  getOrCreateActiveConversation: async () => ({
    id: "conversation-1",
    companyId: "company-1",
    phoneNumber: "967700000001",
    muted: false,
  }),
  getOrCreateConversationForInbound: async () => ({
    id: "conversation-1",
    companyId: "company-1",
    phoneNumber: "967700000001",
    muted: false,
  }),
  getConversation: async () => ({
    id: "conversation-1",
    companyId: "company-1",
    phoneNumber: "967700000001",
    muted: false,
  }),
  getPromptHistory: async () => [],
  listRecentMessages: async () => [],
  recordAnalyticsEvent: async () => undefined,
  recordMutedCustomerActivity: async () => ({
    id: "conversation-1",
    companyId: "company-1",
    phoneNumber: "967700000001",
    muted: true,
    mutedAt: 1_000,
    lastCustomerMessageAt: 1_000,
    nextAutoResumeAt: 2_000,
  }),
  resumeConversation: async () => ({
    id: "conversation-1",
    companyId: "company-1",
    phoneNumber: "967700000001",
    muted: false,
  }),
  startHandoff: async () => ({
    id: "conversation-1",
    companyId: "company-1",
    phoneNumber: "967700000001",
    muted: true,
    mutedAt: 1_000,
    lastCustomerMessageAt: 1_000,
    nextAutoResumeAt: 2_000,
  }),
  trimConversationMessages: async () => ({
    deletedCount: 0,
    remainingCount: 0,
  }),
  ...overrides,
});

describe("createCustomerConversationRouter", () => {
  test("persists customer and assistant messages and sends the assistant reply", async () => {
    const calls: string[] = [];
    const store = createStore({
      appendAssistantMessage: async (input) => {
        calls.push(`assistant:${input.content}:${input.timestamp}`);
        return {
          id: "message-2",
          conversationId: input.conversationId,
          role: "assistant",
          content: input.content,
          timestamp: input.timestamp,
        };
      },
      appendUserMessage: async (input) => {
        calls.push(`user:${input.content}:${input.timestamp}`);
        return {
          id: "message-1",
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
          timestamp: input.timestamp,
        };
      },
      getOrCreateConversationForInbound: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        calls.push(`orchestrator:${input.conversation?.conversationId}:${input.userMessage}`);
        return createCatalogChatResult("Assistant reply", input.userMessage);
      },
    };
    const { logger, errorCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
      now: () => 2_000,
    });

    await router(createMessage(), createContext(outbound));

    expect(calls).toEqual([
      "user:hello:1700000000000",
      "orchestrator:conversation-1:hello",
      "assistant:Assistant reply:2000",
    ]);
    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Assistant reply",
    }]);
    expect(errorCalls).toEqual([]);
  });

  test("reuses one active conversation across repeated customer messages", async () => {
    const conversationIds: string[] = [];
    const store = createStore({
      appendAssistantMessage: async (input) => ({
        id: crypto.randomUUID(),
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
      }),
      appendUserMessage: async (input) => ({
        id: crypto.randomUUID(),
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        timestamp: input.timestamp,
      }),
      getOrCreateConversationForInbound: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        conversationIds.push(input.conversation?.conversationId ?? "missing");
        return createCatalogChatResult("ok", input.userMessage);
      },
    };
    const { logger } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage({ messageId: "message-1" }), createContext(outbound));
    await router(createMessage({ messageId: "message-2", occurredAtMs: 1_700_000_000_001 }), createContext(outbound));

    expect(conversationIds).toEqual(["conversation-1", "conversation-1"]);
  });

  test("passes bounded prompt history into orchestration", async () => {
    let promptHistory: unknown;
    let historyLimit: number | undefined;
    const store = createStore({
      getPromptHistory: async (input) => {
        historyLimit = input.limit;
        return [
          { role: "user", text: "older question" },
          { role: "assistant", text: "older answer" },
          { role: "user", text: "hello" },
        ];
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        promptHistory = input.conversation?.history;
        return createCatalogChatResult("Assistant reply", input.userMessage);
      },
    };
    const { logger } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationHistoryWindowMessages: 12,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(historyLimit).toBe(12);
    expect(promptHistory).toEqual([
      { role: "user", text: "older question" },
      { role: "assistant", text: "older answer" },
      { role: "user", text: "hello" },
    ]);
  });

  test("trims conversation messages after assistant persistence", async () => {
    const calls: string[] = [];
    const store = createStore({
      appendAssistantMessage: async (input) => {
        calls.push(`assistant:${input.content}`);
        return {
          id: "assistant",
          conversationId: input.conversationId,
          role: "assistant",
          content: input.content,
          timestamp: input.timestamp,
        };
      },
      appendUserMessage: async (input) => {
        calls.push(`user:${input.content}`);
        return {
          id: "user",
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
          timestamp: input.timestamp,
        };
      },
      getPromptHistory: async () => [],
      trimConversationMessages: async (input) => {
        calls.push(`trim:${input.maxMessages}`);
        return {
          deletedCount: 2,
          remainingCount: input.maxMessages,
        };
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => createCatalogChatResult("Assistant reply"),
    };
    const { logger, errorCalls } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationHistoryWindowMessages: 12,
      conversationStore: store,
      logger,
      now: () => 2_000,
    });

    await router(createMessage(), createContext(outbound));

    expect(calls).toEqual([
      "user:hello",
      "assistant:Assistant reply",
      "trim:12",
    ]);
    expect(errorCalls).toEqual([]);
  });

  test("atomically persists muted customer messages and skips orchestration for muted conversations", async () => {
    const operations: string[] = [];
    let orchestratorCalled = false;
    const store = createStore({
      appendMutedCustomerMessage: async (input) => {
        operations.push(`muted:${input.content}:${input.timestamp}`);
        return {
          id: input.conversationId,
          companyId: input.companyId,
          phoneNumber: "967700000001",
          muted: true,
          mutedAt: 1_000,
          lastCustomerMessageAt: input.timestamp,
          nextAutoResumeAt: input.timestamp + 1_000,
        };
      },
      appendUserMessage: async () => {
        throw new Error("should not append regular user message when muted");
      },
      getOrCreateConversationForInbound: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 1_000,
        lastCustomerMessageAt: 1_000,
        nextAutoResumeAt: 2_000,
      }),
      recordMutedCustomerActivity: async () => {
        throw new Error("should not separately record muted activity");
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => {
        orchestratorCalled = true;
        return createCatalogChatResult("Assistant reply");
      },
    };
    const { logger } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(orchestratorCalled).toBe(false);
    expect(sent).toEqual([]);
    expect(operations).toEqual(["muted:hello:1700000000000"]);
  });

  test("starts handoff, records analytics, and notifies the owner when the assistant requests handoff", async () => {
    const operations: string[] = [];
    const store = createStore({
      appendAssistantMessageAndStartHandoff: async (input) => {
        operations.push(`assistant-handoff:${input.content}:${input.source}`);
        return {
          id: input.conversationId,
          companyId: input.companyId,
          phoneNumber: "967700000001",
          muted: true,
          mutedAt: input.timestamp,
          lastCustomerMessageAt: input.timestamp,
          nextAutoResumeAt: input.timestamp + 1_000,
        };
      },
      appendUserMessage: async (input) => {
        operations.push(`user:${input.content}`);
        return {
          id: "user",
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
          timestamp: input.timestamp,
        };
      },
      listRecentMessages: async () => [
        {
          id: "user-1",
          conversationId: "conversation-1",
          role: "user",
          content: "hello",
          timestamp: 1_000,
        },
        {
          id: "assistant-1",
          conversationId: "conversation-1",
          role: "assistant",
          content: "Connecting you with the team.",
          timestamp: 2_000,
        },
      ],
      recordAnalyticsEvent: async () => {
        operations.push("analytics");
      },
      startHandoff: async () => {
        throw new Error("should not separately start handoff");
      },
      trimConversationMessages: async (input) => {
        operations.push(`trim:${input.maxMessages}`);
        return {
          deletedCount: 0,
          remainingCount: input.maxMessages,
        };
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => ({
        ...createCatalogChatResult("Connecting you with the team."),
        assistant: {
          schemaVersion: "v1" as const,
          text: "Connecting you with the team.",
          action: { type: "handoff" as const },
        },
      }),
    };
    const { logger, errorCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
      now: () => 2_000,
    });

    await router(createMessage(), createContext(outbound));

    expect(operations).toEqual([
      "user:hello",
      "assistant-handoff:Connecting you with the team.:assistant_action",
      "analytics",
      "trim:20",
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Connecting you with the team.",
    });
    expect(sent[1]?.recipientJid).toBe("966500000000@s.whatsapp.net");
    expect(sent[1]?.text).toContain("Trigger: assistant handoff action");
    expect(errorCalls).toEqual([]);
  });

  test("does not start handoff for low-signal fallback responses", async () => {
    let handoffStarted = false;
    const store = createStore({
      startHandoff: async () => {
        handoffStarted = true;
        return {
          id: "conversation-1",
          companyId: "company-1",
          phoneNumber: "967700000001",
          muted: true,
        };
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => ({
        ...createCatalogChatResult("I couldn't confidently match your request."),
        outcome: "low_signal_fallback",
      }),
    };
    const { logger } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(handoffStarted).toBe(false);
    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "I couldn't confidently match your request.",
    }]);
  });

  test("stops before orchestration when history loading fails", async () => {
    let orchestratorCalled = false;
    const store = createStore({
      getPromptHistory: async () => {
        throw new Error("history failed");
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => {
        orchestratorCalled = true;
        return createCatalogChatResult("Assistant reply");
      },
    };
    const { logger, errorCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(orchestratorCalled).toBe(false);
    expect(sent).toEqual([]);
    expect(errorCalls[0]?.message).toBe("customer conversation persistence failed");
  });

  test("logs trim failures without suppressing the outbound reply", async () => {
    const store = createStore({
      trimConversationMessages: async () => {
        throw new Error("trim failed");
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => createCatalogChatResult("Assistant reply"),
    };
    const { logger, errorCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Assistant reply",
    }]);
    expect(errorCalls[0]?.message).toBe("customer conversation history trimming failed");
  });

  test("serializes media messages into stable placeholder text", async () => {
    const userContents: string[] = [];
    const store = createStore({
      appendAssistantMessage: async (input) => ({
        id: "assistant",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
      }),
      appendUserMessage: async (input) => {
        userContents.push(input.content);
        return {
          id: "user",
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
          timestamp: input.timestamp,
        };
      },
      getOrCreateConversationForInbound: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => createCatalogChatResult("ok", ""),
    };
    const { logger } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage({
      content: { kind: "image", text: "catalog photo", hasMedia: true },
    }), createContext(outbound));
    await router(createMessage({
      content: { kind: "audio", text: "", hasMedia: true },
      messageId: "message-2",
    }), createContext(outbound));
    await router(createMessage({
      content: { kind: "sticker", text: "", hasMedia: true },
      messageId: "message-3",
    }), createContext(outbound));

    expect(userContents).toEqual(["[image] catalog photo", "[audio]", "[sticker]"]);
  });

  test("keeps tenant isolation for the same customer phone across companies", async () => {
    const companyIds: string[] = [];
    const store = createStore({
      appendAssistantMessage: async (input) => ({
        id: "assistant",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
      }),
      appendUserMessage: async (input) => ({
        id: "user",
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        timestamp: input.timestamp,
      }),
      getOrCreateConversationForInbound: async (companyId) => {
        companyIds.push(companyId);
        return {
          id: `conversation-${companyId}`,
          companyId,
          phoneNumber: "967700000001",
          muted: false,
        };
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => createCatalogChatResult("ok", ""),
    };
    const { logger } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage({ companyId: "company-1" }), createContext(outbound));
    await router(createMessage({ companyId: "company-2", sessionKey: "session-2" }), {
      profile: {
        companyId: "company-2",
        name: "Tenant 2",
        ownerPhone: "966500000001",
        sessionKey: "session-2",
        timezone: "UTC",
      },
      outbound,
    });

    expect(companyIds).toEqual(["company-1", "company-2"]);
  });

  test("stops before orchestration when persistence fails", async () => {
    const store = createStore({
      appendAssistantMessage: async () => {
        throw new Error("should not be called");
      },
      appendUserMessage: async () => {
        throw new Error("persist failed");
      },
      getOrCreateConversationForInbound: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
    });
    let orchestratorCalled = false;
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => {
        orchestratorCalled = true;
        throw new Error("should not run");
      },
    };
    const { logger, errorCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(orchestratorCalled).toBe(false);
    expect(sent).toEqual([]);
    expect(errorCalls[0]?.message).toBe("customer conversation persistence failed");
  });

  test("does not persist or send assistant output when orchestration fails", async () => {
    let appendedAssistant = false;
    const store = createStore({
      appendAssistantMessage: async () => {
        appendedAssistant = true;
        throw new Error("should not run");
      },
      appendUserMessage: async (input) => ({
        id: "user",
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        timestamp: input.timestamp,
      }),
      getOrCreateConversationForInbound: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => {
        throw new Error("provider failed");
      },
    };
    const { logger, errorCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(appendedAssistant).toBe(false);
    expect(sent).toEqual([]);
    expect(errorCalls[0]?.message).toBe("customer conversation orchestration failed");
  });

  test("does not send when assistant persistence fails", async () => {
    const store = createStore({
      appendAssistantMessage: async () => {
        throw new Error("assistant persist failed");
      },
      appendUserMessage: async (input) => ({
        id: "user",
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        timestamp: input.timestamp,
      }),
      getOrCreateConversationForInbound: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => createCatalogChatResult("Assistant reply", ""),
    };
    const { logger, errorCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(sent).toEqual([]);
    expect(errorCalls[0]?.message).toBe("customer conversation assistant persistence failed");
  });

  test("logs outbound send failures after assistant persistence", async () => {
    const store = createStore({
      appendAssistantMessage: async (input) => ({
        id: "assistant",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
      }),
      appendUserMessage: async (input) => ({
        id: "user",
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        timestamp: input.timestamp,
      }),
      getOrCreateActiveConversation: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => createCatalogChatResult("Assistant reply", ""),
    };
    const { logger, errorCalls } = createLogger();
    const outbound: OutboundMessenger = {
      sendMedia: async () => [],
      sendSequence: async () => [],
      sendText: async () => {
        throw new Error("send failed");
      },
    };
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(errorCalls[0]?.message).toBe("customer conversation outbound send failed");
  });

  test("logs and stops when outbound is unavailable", async () => {
    let usedRouterDependencies = false;
    const store = createStore({
      appendAssistantMessage: async () => {
        usedRouterDependencies = true;
        throw new Error("should not run");
      },
      appendUserMessage: async () => {
        usedRouterDependencies = true;
        throw new Error("should not run");
      },
      getOrCreateConversationForInbound: async () => {
        usedRouterDependencies = true;
        throw new Error("should not run");
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => {
        usedRouterDependencies = true;
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

    expect(usedRouterDependencies).toBe(false);
    expect(errorCalls[0]?.message).toBe("customer conversation outbound messenger unavailable");
  });
});
