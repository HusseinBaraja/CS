import { describe, expect, test } from 'bun:test';
import type { AssistantSemanticRecordDto } from '@cs/shared';
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

const createPromptHistorySelection = (
  turns: Array<{ role: "user" | "assistant"; text: string }> = [],
  overrides: Partial<{
    selectionMode: "no_history" | "recent_window" | "stale_reset_empty" | "quoted_reference_window";
    usedQuotedReference: boolean;
  }> = {},
) => {
  const selectionMode =
    overrides.selectionMode ?? (turns.length > 0 ? "recent_window" : "no_history");

  return {
    turns,
    selectionMode,
    usedQuotedReference:
      overrides.usedQuotedReference ?? selectionMode === "quoted_reference_window",
  };
};

const createCanonicalStateReadResult = () => ({
  state: {
    schemaVersion: "v1" as const,
    conversationId: "conversation-1",
    companyId: "company-1",
    currentFocus: {
      kind: "none" as const,
      entityIds: [],
    },
    pendingClarification: {
      active: false,
    },
    freshness: {
      status: "stale" as const,
    },
    sourceOfTruthMarkers: {},
    heuristicHints: {
      usedQuotedReference: false,
      topCandidates: [],
    },
  },
  invalidatedPaths: [],
});

const createAssistantSemanticRecord = (): AssistantSemanticRecordDto => ({
  id: "semantic-record-1",
  schemaVersion: "v1",
  companyId: "company-1",
  conversationId: "conversation-1",
  assistantMessageId: "assistant-message-1",
  actionType: "none",
  normalizedAction: "answer",
  semanticRecordStatus: "complete",
  presentedNumberedList: false,
  orderedPresentedEntityIds: ["product-1"],
  displayIndexToEntityIdMap: [],
  referencedEntities: [{
    entityKind: "product",
    entityId: "product-1",
    source: "raw_text",
    confidence: "high",
  }],
  resolvedStandaloneQueryUsed: {
    text: "burger box",
    status: "used",
  },
  responseLanguage: "en",
  responseMode: "grounded",
  groundingSourceMetadata: {
    usedRetrieval: true,
    usedConversationState: false,
    usedSummary: false,
    retrievalMode: "raw_latest_message",
    groundedEntityIds: ["product-1"],
  },
  stateMutationHints: {
    focusKind: "product",
    focusEntityIds: ["product-1"],
    shouldSetPendingClarification: false,
    latestStandaloneQueryText: "burger box",
  },
  createdAt: 1_800,
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
      debug: (payload: unknown, message: string) => {
        infoCalls.push({ payload, message });
      },
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
      return [{
        attempts: 1,
        kind: "text",
        messageId: `sent-${sent.length}`,
        recipientJid: input.recipientJid,
        stepIndex: 0,
      }];
    },
  };

  return { outbound, sent };
};

const createContext = (outbound?: OutboundMessenger): InboundRouteContext => ({
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
  ...(outbound ? { outbound } : {}),
});

const createStore = (overrides: Partial<ConversationStore> = {}): ConversationStore => ({
  appendPendingAssistantMessage: async (input) => ({
    id: "pending-assistant-message",
    conversationId: input.conversationId,
    role: "assistant",
    content: input.content,
    timestamp: input.timestamp,
    deliveryState: "pending",
  }),
  acknowledgePendingAssistantMessage: async (input) => ({
    id: input.pendingMessageId,
    conversationId: input.conversationId,
    role: "assistant",
    content: "acknowledged assistant",
    timestamp: input.acknowledgedAt,
    deliveryState: "pending",
    providerAcknowledgedAt: input.acknowledgedAt,
    sideEffectsState: "pending",
    analyticsState: "not_applicable",
    ownerNotificationState: "not_applicable",
    ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
  }),
  completePendingAssistantSideEffects: async (input) => ({
    id: input.pendingMessageId,
    conversationId: input.conversationId,
    role: "assistant",
    content: "completed assistant",
    timestamp: 1_000,
    deliveryState: "sent",
    sideEffectsState: input.analyticsCompleted || input.ownerNotificationCompleted ? "completed" : "pending",
    analyticsState: input.analyticsCompleted ? "completed" : "recorded",
    ownerNotificationState: input.ownerNotificationCompleted ? "completed" : "sent",
  }),
  recordPendingAssistantSideEffectProgress: async (input) => ({
    id: input.pendingMessageId,
    conversationId: input.conversationId,
    role: "assistant",
    content: "progress assistant",
    timestamp: 1_000,
    deliveryState: "sent",
    sideEffectsState: "pending",
    analyticsState: input.analyticsRecorded ? "recorded" : "pending",
    ownerNotificationState: input.ownerNotificationSent ? "sent" : "pending",
  }),
  commitPendingAssistantMessage: async (input) => ({
    id: input.conversationId,
    companyId: input.companyId,
    phoneNumber: "967700000001",
    muted: false,
  }),
  markPendingAssistantMessageFailed: async (input) => ({
    id: input.pendingMessageId,
    conversationId: input.conversationId,
    role: "assistant",
    content: "failed assistant",
    timestamp: 1_000,
    deliveryState: "failed",
  }),
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
    nextAutoResumeAt: input.timestamp + 1_000,
  }),
  appendInboundCustomerMessage: async (input) => ({
    conversation: {
      id: "conversation-1",
      companyId: input.companyId,
      phoneNumber: input.phoneNumber,
      muted: false,
    },
    wasMuted: false,
    wasDuplicate: false,
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
  getPromptHistoryForInbound: async () => createPromptHistorySelection(),
  getCanonicalConversationState: async () => createCanonicalStateReadResult(),
  getQuotedReferenceContext: async () => null,
  listRelevantAssistantSemanticRecords: async () => [],
  getLatestConversationSummary: async () => null,
  applyCanonicalConversationTurnOutcome: async () => createCanonicalStateReadResult().state,
  persistAssistantSemanticRecord: async () => createAssistantSemanticRecord(),
  upsertConversationSummary: async () => ({
    summaryId: "summary-1",
    conversationId: "conversation-1",
    stablePreferences: [],
    importantResolvedDecisions: [],
    historicalContextNeededForFutureTurns: [],
    freshness: {
      status: "fresh",
      updatedAt: 1_000,
    },
    provenance: {
      source: "system_seed",
      generatedAt: 1_000,
    },
    coveredMessageRange: {},
  }),
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
      appendInboundCustomerMessage: async (input) => {
        calls.push(`inbound:${input.content}:${input.timestamp}:${input.transportMessageId}:${input.referencedTransportMessageId ?? "none"}`);
        return {
          conversation: {
            id: "conversation-1",
            companyId: input.companyId,
            phoneNumber: input.phoneNumber,
            muted: false,
          },
          wasMuted: false,
          wasDuplicate: false,
        };
      },
      appendPendingAssistantMessage: async (input) => {
        calls.push(`pending:${input.content}:${input.timestamp}:${input.source ?? "none"}`);
        return {
          id: "pending-message-1",
          conversationId: input.conversationId,
          role: "assistant",
          content: input.content,
          timestamp: input.timestamp,
          deliveryState: "pending",
        };
      },
      acknowledgePendingAssistantMessage: async (input) => {
        calls.push(`ack:${input.pendingMessageId}:${input.transportMessageId ?? "none"}:${input.acknowledgedAt}`);
        return {
          id: input.pendingMessageId,
          conversationId: input.conversationId,
          role: "assistant",
          content: "Assistant reply",
          timestamp: 2_000,
          deliveryState: "pending",
          providerAcknowledgedAt: input.acknowledgedAt,
          sideEffectsState: "pending",
          analyticsState: "not_applicable",
          ownerNotificationState: "not_applicable",
          ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
        };
      },
      commitPendingAssistantMessage: async (input) => {
        calls.push(`commit:${input.pendingMessageId}:${input.transportMessageId ?? "none"}`);
        return {
          id: input.conversationId,
          companyId: input.companyId,
          phoneNumber: "967700000001",
          muted: false,
        };
      },
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
      "inbound:hello:1700000000000:message-1:none",
      "orchestrator:conversation-1:hello",
      "pending:Assistant reply:2000:none",
      "ack:pending-message-1:sent-1:2000",
      "commit:pending-message-1:sent-1",
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
      appendInboundCustomerMessage: async (input) => ({
        conversation: {
          id: "conversation-1",
          companyId: input.companyId,
          phoneNumber: input.phoneNumber,
          muted: false,
        },
        wasMuted: false,
        wasDuplicate: false,
      }),
      appendAssistantMessage: async (input) => ({
        id: crypto.randomUUID(),
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
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

  test("stops before history and orchestration for duplicate inbound deliveries", async () => {
    let historyCalled = false;
    let orchestratorCalled = false;
    const store = createStore({
      appendInboundCustomerMessage: async (input) => ({
        conversation: {
          id: "conversation-1",
          companyId: input.companyId,
          phoneNumber: input.phoneNumber,
          muted: false,
        },
        wasMuted: false,
        wasDuplicate: true,
      }),
      getPromptHistoryForInbound: async () => {
        historyCalled = true;
        return createPromptHistorySelection();
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

    expect(historyCalled).toBe(false);
    expect(orchestratorCalled).toBe(false);
    expect(sent).toEqual([]);
  });

  test("passes bounded lifecycle-aware prompt history into orchestration", async () => {
    let promptHistory: unknown;
    let historyLimit: number | undefined;
    const store = createStore({
      getPromptHistoryForInbound: async (input) => {
        historyLimit = input.limit;
        return createPromptHistorySelection([
          { role: "user", text: "older question" },
          { role: "assistant", text: "older answer" },
          { role: "user", text: "hello" },
        ]);
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        promptHistory = input.conversation?.recentTurns;
        expect(input.conversation?.historyDiagnostics).toEqual({
          selectionMode: "recent_window",
          usedQuotedReference: false,
        });
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

  test("loads canonical state before orchestration and writes it after assistant commit", async () => {
    const operations: string[] = [];
    let orchestratorInput: Parameters<CatalogChatOrchestrator["respond"]>[0] | undefined;
    const store = createStore({
      getCanonicalConversationState: async (input) => {
        operations.push(`loadCanonical:${input.conversationId}:${input.now}`);
        return {
          state: {
            ...createCanonicalStateReadResult().state,
            currentFocus: {
              kind: "product",
              entityIds: ["product-1"],
              source: "retrieval_single_candidate",
              updatedAt: 900,
            },
            heuristicHints: {
              usedQuotedReference: false,
              topCandidates: [{
                entityKind: "product",
                entityId: "product-1",
                score: 0.92,
              }],
            },
          },
          invalidatedPaths: ["heuristicHints.heuristicFocus"],
        };
      },
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-message-1",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
      }),
      acknowledgePendingAssistantMessage: async (input) => ({
        id: input.pendingMessageId,
        conversationId: input.conversationId,
        role: "assistant",
        content: "Assistant reply",
        timestamp: 2_000,
        deliveryState: "pending",
        providerAcknowledgedAt: input.acknowledgedAt,
        analyticsState: "not_applicable",
        ownerNotificationState: "not_applicable",
      }),
      commitPendingAssistantMessage: async (input) => {
        operations.push(`commit:${input.pendingMessageId}`);
        return {
          id: input.conversationId,
          companyId: input.companyId,
          phoneNumber: "967700000001",
          muted: false,
        };
      },
      applyCanonicalConversationTurnOutcome: async (input) => {
        operations.push(`writeCanonical:${input.conversationId}:${input.assistantActionType}:${input.retrievalOutcome}`);
        expect(input).toEqual({
          companyId: "company-1",
          conversationId: "conversation-1",
          responseLanguage: "en",
          latestUserMessageText: "hello",
          assistantActionType: "none",
          committedAssistantTimestamp: 2_000,
          promptHistorySelectionMode: "no_history",
          usedQuotedReference: false,
          retrievalOutcome: "grounded",
          candidates: [{
            entityKind: "product",
            entityId: "product-1",
            score: 0.92,
          }],
        });
        return {
          ...createCanonicalStateReadResult().state,
          responseLanguage: "en",
          currentFocus: {
            kind: "product",
            entityIds: ["product-1"],
            source: "retrieval_single_candidate",
            updatedAt: 2_000,
          },
          freshness: {
            status: "fresh",
            updatedAt: 2_000,
            activeWindowExpiresAt: 32_000,
          },
          sourceOfTruthMarkers: {
            currentFocus: "retrieval_single_candidate",
            latestStandaloneQuery: "system_passthrough",
            pendingClarification: "system_passthrough",
            responseLanguage: "system_passthrough",
          },
          latestStandaloneQuery: {
            text: "hello",
            status: "unresolved_passthrough",
            source: "system_passthrough",
            updatedAt: 2_000,
          },
          heuristicHints: {
            usedQuotedReference: false,
            topCandidates: [{
              entityKind: "product",
              entityId: "product-1",
              score: 0.92,
            }],
            heuristicFocus: {
              kind: "product",
              entityIds: ["product-1"],
              source: "heuristic",
              updatedAt: 2_000,
            },
          },
        };
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        orchestratorInput = input;
        return {
          ...createCatalogChatResult("Assistant reply", input.userMessage),
          retrieval: {
            outcome: "grounded",
            query: input.userMessage,
            language: "en",
            topScore: 0.92,
            candidates: [{
              productId: "product-1",
              score: 0.92,
              matchedEmbeddingId: "embedding-1",
              matchedText: "Burger Box",
              language: "en",
              contextBlock: {
                id: "product-1",
                heading: "Burger Box",
                body: "Name (EN): Burger Box",
              },
              product: {
                id: "product-1",
                categoryId: "category-1",
                nameEn: "Burger Box",
                imageCount: 0,
                variants: [],
              },
            }],
            contextBlocks: [{
              id: "product-1",
              heading: "Burger Box",
              body: "Name (EN): Burger Box",
            }],
          },
        };
      },
    };
    const { logger, errorCalls, infoCalls } = createLogger();
    const { outbound, sent } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
      now: () => 2_000,
    });

    await router(createMessage(), createContext(outbound));

    expect(orchestratorInput?.conversation?.canonicalState?.currentFocus).toEqual({
      kind: "product",
      entityIds: ["product-1"],
      source: "retrieval_single_candidate",
      updatedAt: 900,
    });
    expect(operations).toEqual([
      "loadCanonical:conversation-1:1700000000000",
      "commit:pending-message-1",
      "writeCanonical:conversation-1:none:grounded",
    ]);
    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Assistant reply",
    }]);
    expect(errorCalls).toEqual([]);
    expect(infoCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "customer conversation canonical state loaded",
        payload: expect.objectContaining({
          event: "conversation.canonical_state.load_recorded",
          outcome: "loaded",
          conversationId: "conversation-1",
          requestId: "message-1",
          invalidatedPathCount: 1,
          freshnessStatus: "stale",
          authoritativeFocusKind: "product",
          authoritativeFocusEntityCount: 1,
          heuristicCandidateCount: 1,
        }),
      }),
      expect.objectContaining({
        message: "customer conversation canonical state invalidated",
        payload: expect.objectContaining({
          event: "conversation.canonical_state.invalidation_recorded",
          outcome: "recorded",
          conversationId: "conversation-1",
          requestId: "message-1",
          invalidatedPathCount: 1,
          invalidatedPaths: ["heuristicHints.heuristicFocus"],
        }),
      }),
      expect.objectContaining({
        message: "customer conversation canonical state written",
        payload: expect.objectContaining({
          event: "conversation.canonical_state.write_recorded",
          outcome: "written",
          conversationId: "conversation-1",
          requestId: "message-1",
          authoritativeFocusKind: "product",
          authoritativeFocusEntityCount: 1,
          authoritativeFocusSource: "retrieval_single_candidate",
          pendingClarificationActive: false,
          heuristicCandidateCount: 1,
          latestStandaloneQueryStatus: "unresolved_passthrough",
          responseLanguage: "en",
        }),
      }),
    ]));
  });

  test("loads turn-resolution support context before orchestration", async () => {
    const operations: string[] = [];
    let orchestratorInput: Parameters<CatalogChatOrchestrator["respond"]>[0] | undefined;
    const store = createStore({
      getQuotedReferenceContext: async (input) => {
        operations.push(`quoted:${input.referencedTransportMessageId}`);
        return {
          transportMessageId: "quoted-message-1",
          conversationMessageId: "assistant-message-0",
          role: "assistant",
          text: "1. Burger Box",
          presentedList: {
            kind: "product",
            items: [{
              displayIndex: 1,
              entityKind: "product",
              entityId: "product-1",
              score: 0.9,
            }],
          },
          referencedEntities: [{
            entityKind: "product",
            entityId: "product-1",
            source: "semantic_assistant_record",
            confidence: "high",
          }],
        };
      },
      listRelevantAssistantSemanticRecords: async (input) => {
        operations.push(`semantic:${input.limit}:${input.beforeTimestamp}`);
        return [createAssistantSemanticRecord()];
      },
      getLatestConversationSummary: async (input) => {
        operations.push(`summary:${input.conversationId}`);
        return {
          summaryId: "summary-1",
          conversationId: input.conversationId,
          durableCustomerGoal: "Find burger box options",
          stablePreferences: ["Arabic replies"],
          importantResolvedDecisions: [],
          historicalContextNeededForFutureTurns: ["Customer compares burger box sizes"],
          freshness: {
            status: "fresh",
            updatedAt: 1_600,
          },
          provenance: {
            source: "summary_job",
            generatedAt: 1_600,
          },
          coveredMessageRange: {
            fromMessageId: "message-1",
            toMessageId: "message-4",
            messageCount: 4,
          },
        };
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        orchestratorInput = input;
        return createCatalogChatResult("Assistant reply", input.userMessage);
      },
    };
    const { logger } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage({
      replyContext: {
        referencedMessageId: "quoted-message-1",
      },
    }), createContext(outbound));

    expect(operations).toEqual([
      "quoted:quoted-message-1",
      "semantic:20:1700000000000",
      "summary:conversation-1",
    ]);
    expect(orchestratorInput?.conversation?.quotedReference).toEqual({
      transportMessageId: "quoted-message-1",
      conversationMessageId: "assistant-message-0",
      role: "assistant",
      text: "1. Burger Box",
      presentedList: {
        kind: "product",
        items: [{
          displayIndex: 1,
          entityKind: "product",
          entityId: "product-1",
          score: 0.9,
        }],
      },
      referencedEntities: [{
        entityKind: "product",
        entityId: "product-1",
        source: "semantic_assistant_record",
        confidence: "high",
      }],
    });
    expect(orchestratorInput?.conversation?.semanticAssistantRecords).toEqual([{
      semanticRecordId: "semantic-record-1",
      assistantMessageId: "assistant-message-1",
      actionType: "none",
      responseLanguage: "en",
      responseMode: "grounded",
      orderedPresentedEntityIds: ["product-1"],
      referencedEntities: [{
        entityKind: "product",
        entityId: "product-1",
        source: "raw_text",
        confidence: "high",
      }],
      resolvedStandaloneQueryUsed: {
        text: "burger box",
        status: "used",
      },
      createdAt: 1_800,
    }]);
    expect(orchestratorInput?.conversation?.summary).toEqual({
      summaryId: "summary-1",
      conversationId: "conversation-1",
      durableCustomerGoal: "Find burger box options",
      stablePreferences: ["Arabic replies"],
      importantResolvedDecisions: [],
      historicalContextNeededForFutureTurns: ["Customer compares burger box sizes"],
      freshness: {
        status: "fresh",
        updatedAt: 1_600,
      },
      provenance: {
        source: "summary_job",
        generatedAt: 1_600,
      },
      coveredMessageRange: {
        fromMessageId: "message-1",
        toMessageId: "message-4",
        messageCount: 4,
      },
    });
    expect(orchestratorInput?.conversation?.resolutionPolicy).toEqual({
      allowModelAssistedFallback: false,
      allowSemanticAssistantFallback: true,
      allowSummarySupport: true,
      staleContextWindowMs: 1_800_000,
      quotedReferenceOverridesStaleness: true,
      minimumConfidenceToProceed: "high",
      allowMediumConfidenceProceed: false,
      maxSemanticFallbackDepth: 3,
    });
  });

  test("continues orchestration when canonical state loading fails", async () => {
    let orchestratorCalled = false;
    const store = createStore({
      getCanonicalConversationState: async () => {
        throw new Error("canonical load failed");
      },
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-assistant",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
      }),
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        orchestratorCalled = true;
        expect(input.conversation?.canonicalState).toBeUndefined();
        return createCatalogChatResult("Assistant reply", input.userMessage);
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

    expect(orchestratorCalled).toBe(true);
    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Assistant reply",
    }]);
    expect(errorCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "customer conversation canonical state load failed",
        payload: expect.objectContaining({
          event: "conversation.canonical_state.load_recorded",
          outcome: "load_failed",
          conversationId: "conversation-1",
          requestId: "message-1",
          invalidatedPathCount: 0,
        }),
      }),
    ]));
  });

  test("logs canonical state write failures without affecting the customer reply", async () => {
    const store = createStore({
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-assistant",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
      }),
      applyCanonicalConversationTurnOutcome: async () => {
        throw new Error("canonical write failed");
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
    expect(errorCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "customer conversation canonical state write failed",
        payload: expect.objectContaining({
          event: "conversation.canonical_state.write_recorded",
          outcome: "write_failed",
          conversationId: "conversation-1",
          requestId: "message-1",
          authoritativeFocusKind: "none",
          authoritativeFocusEntityCount: 0,
          heuristicCandidateCount: 0,
        }),
      }),
    ]));
  });

  test("trims conversation messages after assistant persistence", async () => {
    const calls: string[] = [];
    const store = createStore({
      appendInboundCustomerMessage: async (input) => {
        calls.push(`inbound:${input.content}`);
        return {
          conversation: {
            id: "conversation-1",
            companyId: input.companyId,
            phoneNumber: input.phoneNumber,
            muted: false,
          },
          wasMuted: false,
          wasDuplicate: false,
        };
      },
      appendPendingAssistantMessage: async (input) => {
        calls.push(`pending:${input.content}`);
        return {
          id: "pending-1",
          conversationId: input.conversationId,
          role: "assistant",
          content: input.content,
          timestamp: input.timestamp,
          deliveryState: "pending",
        };
      },
      acknowledgePendingAssistantMessage: async (input) => {
        calls.push(`ack:${input.pendingMessageId}:${input.transportMessageId ?? "none"}`);
        return {
          id: input.pendingMessageId,
          conversationId: input.conversationId,
          role: "assistant",
          content: "Assistant reply",
          timestamp: 2_000,
          deliveryState: "pending",
          providerAcknowledgedAt: 2_000,
          sideEffectsState: "pending",
          analyticsState: "not_applicable",
          ownerNotificationState: "not_applicable",
          ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
        };
      },
      commitPendingAssistantMessage: async (input) => {
        calls.push(`commit:${input.pendingMessageId}:${input.transportMessageId ?? "none"}`);
        return {
          id: input.conversationId,
          companyId: input.companyId,
          phoneNumber: "967700000001",
          muted: false,
        };
      },
      getPromptHistoryForInbound: async () => createPromptHistorySelection(),
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
      "inbound:hello",
      "pending:Assistant reply",
      "ack:pending-1:sent-1",
      "commit:pending-1:sent-1",
      "trim:12",
    ]);
    expect(errorCalls).toEqual([]);
  });

  test("atomically persists muted customer messages and skips orchestration for muted conversations", async () => {
    const operations: string[] = [];
    let orchestratorCalled = false;
    const store = createStore({
      appendInboundCustomerMessage: async (input) => {
        operations.push(`muted:${input.content}:${input.timestamp}`);
        return {
          conversation: {
            id: "conversation-1",
            companyId: input.companyId,
            phoneNumber: input.phoneNumber,
            muted: true,
            mutedAt: 1_000,
            lastCustomerMessageAt: input.timestamp,
            nextAutoResumeAt: input.timestamp + 1_000,
          },
          wasMuted: true,
          wasDuplicate: false,
        };
      },
      appendUserMessage: async () => {
        throw new Error("should not append regular user message when muted");
      },
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
      appendInboundCustomerMessage: async (input) => {
        operations.push(`inbound:${input.content}`);
        return {
          conversation: {
            id: "conversation-1",
            companyId: input.companyId,
            phoneNumber: input.phoneNumber,
            muted: false,
          },
          wasMuted: false,
          wasDuplicate: false,
        };
      },
      appendPendingAssistantMessage: async (input) => {
        operations.push(`pending:${input.content}:${input.source ?? "none"}`);
        return {
          id: "pending-handoff-1",
          conversationId: input.conversationId,
          role: "assistant",
          content: input.content,
          timestamp: input.timestamp,
          deliveryState: "pending",
        };
      },
      acknowledgePendingAssistantMessage: async (input) => {
        operations.push(`ack:${input.pendingMessageId}:${input.transportMessageId ?? "none"}`);
        return {
          id: input.pendingMessageId,
          conversationId: input.conversationId,
          role: "assistant",
          content: "Connecting you with the team.",
          timestamp: 2_000,
          deliveryState: "pending",
          providerAcknowledgedAt: 2_000,
          sideEffectsState: "pending",
          analyticsState: "pending",
          ownerNotificationState: "pending",
          ...(input.transportMessageId ? { transportMessageId: input.transportMessageId } : {}),
        };
      },
      commitPendingAssistantMessage: async (input) => {
        operations.push(`commit:${input.pendingMessageId}:${input.transportMessageId ?? "none"}`);
        return {
          id: input.conversationId,
          companyId: input.companyId,
          phoneNumber: "967700000001",
          muted: true,
          mutedAt: 2_000,
          nextAutoResumeAt: 3_000,
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
      recordAnalyticsEvent: async (input) => {
        operations.push(`analytics:${input.idempotencyKey ?? "none"}`);
      },
      recordPendingAssistantSideEffectProgress: async (input) => {
        operations.push(
          `progress:${input.analyticsRecorded === true ? "analytics" : "none"}:${input.ownerNotificationSent === true ? "owner" : "none"}`,
        );
        return {
          id: input.pendingMessageId,
          conversationId: input.conversationId,
          role: "assistant",
          content: "Connecting you with the team.",
          timestamp: 2_000,
          deliveryState: "sent",
          sideEffectsState: "pending",
          analyticsState: input.analyticsRecorded ? "recorded" : "pending",
          ownerNotificationState: input.ownerNotificationSent ? "sent" : "pending",
        };
      },
      completePendingAssistantSideEffects: async (input) => {
        operations.push(
          `complete:${input.analyticsCompleted === true ? "analytics" : "none"}:${input.ownerNotificationCompleted === true ? "owner" : "none"}`,
        );
        return {
          id: input.pendingMessageId,
          conversationId: input.conversationId,
          role: "assistant",
          content: "Connecting you with the team.",
          timestamp: 2_000,
          deliveryState: "sent",
          sideEffectsState: "completed",
          analyticsState: input.analyticsCompleted ? "completed" : "recorded",
          ownerNotificationState: input.ownerNotificationCompleted ? "completed" : "sent",
        };
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
      "inbound:hello",
      "pending:Connecting you with the team.:assistant_action",
      "ack:pending-handoff-1:sent-1",
      "commit:pending-handoff-1:sent-1",
      "analytics:pendingMessage:pending-handoff-1:handoff_started",
      "progress:analytics:none",
      "complete:analytics:none",
      "progress:none:owner",
      "complete:none:owner",
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

  test("persists assistant semantic records after assistant commit", async () => {
    const persistedInputs: Array<Record<string, unknown>> = [];
    const operations: string[] = [];
    const store = createStore({
      commitPendingAssistantMessage: async (input) => {
        operations.push(`commit:${input.pendingMessageId}`);
        return {
          id: input.conversationId,
          companyId: input.companyId,
          phoneNumber: "967700000001",
          muted: false,
        };
      },
      persistAssistantSemanticRecord: async (input) => {
        operations.push(`semantic:${input.assistantMessageId}`);
        persistedInputs.push(input as unknown as Record<string, unknown>);
        return createAssistantSemanticRecord();
      },
      applyCanonicalConversationTurnOutcome: async (input) => {
        operations.push(`canonical:${input.conversationId}`);
        return createCanonicalStateReadResult().state;
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async () => ({
        ...createCatalogChatResult("Burger Box is available.", "burger box"),
        retrieval: {
          outcome: "grounded",
          query: "burger box",
          language: "en",
          topScore: 0.93,
          candidates: [{
            productId: "product-1",
            score: 0.93,
            matchedEmbeddingId: "embedding-1",
            matchedText: "Burger Box",
            language: "en",
            contextBlock: {
              id: "product-1",
              heading: "Burger Box",
              body: "Name (EN): Burger Box",
            },
            product: {
              id: "product-1",
              categoryId: "category-1",
              nameEn: "Burger Box",
              imageCount: 0,
              variants: [],
            },
          }],
          contextBlocks: [{
            id: "product-1",
            heading: "Burger Box",
            body: "Name (EN): Burger Box",
          }],
        },
      }),
    };
    const { logger, errorCalls } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
      now: () => 2_000,
    });

    await router(createMessage(), createContext(outbound));

    expect(operations).toEqual([
      "commit:pending-assistant-message",
      "semantic:pending-assistant-message",
      "canonical:conversation-1",
    ]);
    expect(persistedInputs).toEqual([expect.objectContaining({
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "pending-assistant-message",
      actionType: "none",
      normalizedAction: "answer",
      semanticRecordStatus: "complete",
      responseLanguage: "en",
      responseMode: "grounded",
      referencedEntities: [{
        entityKind: "product",
        entityId: "product-1",
        source: "raw_text",
        confidence: "high",
      }],
      groundingSourceMetadata: {
        usedRetrieval: true,
        usedConversationState: false,
        usedSummary: false,
        retrievalMode: "raw_latest_message",
        groundedEntityIds: ["product-1"],
      },
      stateMutationHints: {
        focusKind: "product",
        focusEntityIds: ["product-1"],
        shouldSetPendingClarification: false,
        latestStandaloneQueryText: "burger box",
      },
      createdAt: 2_000,
    })]);
    expect(errorCalls).toEqual([]);
  });

  test("logs assistant semantic persistence failures without affecting the customer reply", async () => {
    let canonicalWriteCalled = false;
    const store = createStore({
      persistAssistantSemanticRecord: async () => {
        throw new Error("semantic persistence failed");
      },
      applyCanonicalConversationTurnOutcome: async () => {
        canonicalWriteCalled = true;
        return createCanonicalStateReadResult().state;
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
      now: () => 2_000,
    });

    await router(createMessage(), createContext(outbound));

    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Assistant reply",
    }]);
    expect(canonicalWriteCalled).toBe(true);
    expect(errorCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "customer conversation assistant semantic persistence failed",
        payload: expect.objectContaining({
          event: "bot.router.assistant_semantic_persistence_failed",
          companyId: "company-1",
          conversationId: "conversation-1",
          pendingMessageId: "pending-assistant-message",
          outcome: "error",
          assistantTextLength: "Assistant reply".length,
        }),
      }),
    ]));
  });

  test("stops before orchestration when history loading fails", async () => {
    let orchestratorCalled = false;
    const store = createStore({
      getPromptHistoryForInbound: async () => {
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
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantText");
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantTextSha256");
    expect(errorCalls[0]?.payload).toMatchObject({ assistantTextLength: "Assistant reply".length });
  });

  test("serializes media messages into stable placeholder text", async () => {
    const userContents: string[] = [];
    const store = createStore({
      appendInboundCustomerMessage: async (input) => {
        userContents.push(input.content);
        return {
          conversation: {
            id: "conversation-1",
            companyId: input.companyId,
            phoneNumber: input.phoneNumber,
            muted: false,
          },
          wasMuted: false,
          wasDuplicate: false,
        };
      },
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-assistant",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
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
      appendInboundCustomerMessage: async (input) => {
        companyIds.push(input.companyId);
        return {
          conversation: {
            id: `conversation-${input.companyId}`,
            companyId: input.companyId,
            phoneNumber: input.phoneNumber,
            muted: false,
          },
          wasMuted: false,
          wasDuplicate: false,
        };
      },
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-assistant",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
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

    await router(createMessage({ companyId: "company-1" }), createContext(outbound));
    await router(createMessage({ companyId: "company-2", sessionKey: "session-2" }), {
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
      appendPendingAssistantMessage: async () => {
        throw new Error("should not be called");
      },
      appendInboundCustomerMessage: async () => {
        throw new Error("persist failed");
      },
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
      appendInboundCustomerMessage: async (input) => ({
        conversation: {
          id: "conversation-1",
          companyId: input.companyId,
          phoneNumber: input.phoneNumber,
          muted: false,
        },
        wasMuted: false,
        wasDuplicate: false,
      }),
      appendPendingAssistantMessage: async () => {
        appendedAssistant = true;
        throw new Error("should not run");
      },
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

  test("leaves a pending assistant reply for reconciliation when commit fails", async () => {
    let canonicalWriteCalled = false;
    const store = createStore({
      appendInboundCustomerMessage: async (input) => ({
        conversation: {
          id: "conversation-1",
          companyId: input.companyId,
          phoneNumber: input.phoneNumber,
          muted: false,
        },
        wasMuted: false,
        wasDuplicate: false,
      }),
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-message-1",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
      }),
      applyCanonicalConversationTurnOutcome: async () => {
        canonicalWriteCalled = true;
        throw new Error("should not write canonical state");
      },
      commitPendingAssistantMessage: async () => {
        throw new Error("assistant commit failed");
      },
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

    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Assistant reply",
    }]);
    expect(errorCalls[0]?.message).toBe("customer conversation assistant persistence failed");
    expect(errorCalls[0]?.payload).toMatchObject({
      pendingMessageId: "pending-message-1",
      assistantTextLength: "Assistant reply".length,
    });
    expect(canonicalWriteCalled).toBe(false);
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantText");
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantTextSha256");
  });

  test("stops after send when acknowledgement persistence fails", async () => {
    let commitCalled = false;
    const store = createStore({
      appendInboundCustomerMessage: async (input) => ({
        conversation: {
          id: "conversation-1",
          companyId: input.companyId,
          phoneNumber: input.phoneNumber,
          muted: false,
        },
        wasMuted: false,
        wasDuplicate: false,
      }),
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-message-1",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
      }),
      acknowledgePendingAssistantMessage: async () => {
        throw new Error("ack failed");
      },
      commitPendingAssistantMessage: async () => {
        commitCalled = true;
        throw new Error("should not commit");
      },
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

    expect(sent).toEqual([{
      recipientJid: "967700000001@s.whatsapp.net",
      text: "Assistant reply",
    }]);
    expect(commitCalled).toBe(false);
    expect(errorCalls[0]?.message).toBe("customer conversation assistant acknowledgement persistence failed");
    expect(errorCalls[0]?.payload).toMatchObject({
      pendingMessageId: "pending-message-1",
      outboundMessageId: "sent-1",
      assistantTextLength: "Assistant reply".length,
    });
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantText");
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantTextSha256");
  });

  test("marks the pending assistant reply failed when outbound send fails", async () => {
    let markedFailed = false;
    const store = createStore({
      appendInboundCustomerMessage: async (input) => ({
        conversation: {
          id: "conversation-1",
          companyId: input.companyId,
          phoneNumber: input.phoneNumber,
          muted: false,
        },
        wasMuted: false,
        wasDuplicate: false,
      }),
      appendPendingAssistantMessage: async (input) => {
        return {
          id: "pending-message-1",
          conversationId: input.conversationId,
          role: "assistant",
          content: input.content,
          timestamp: input.timestamp,
          deliveryState: "pending",
        };
      },
      markPendingAssistantMessageFailed: async (input) => {
        markedFailed = true;
        return {
          id: input.pendingMessageId,
          conversationId: input.conversationId,
          role: "assistant",
          content: "Assistant reply",
          timestamp: 1_000,
          deliveryState: "failed",
        };
      },
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

    expect(markedFailed).toBe(true);
    expect(errorCalls[0]?.message).toBe("customer conversation outbound send failed");
    expect(errorCalls[0]?.payload).toMatchObject({
      pendingMessageId: "pending-message-1",
      recipientPhoneNumber: "***0001",
      assistantTextLength: "Assistant reply".length,
    });
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantText");
    expect(errorCalls[0]?.payload).not.toHaveProperty("assistantTextSha256");
  });

  test("sends empty history after a stale idle gap without a quoted reference", async () => {
    let promptHistory: unknown;
    let historyInput: unknown;
    const store = createStore({
      getPromptHistoryForInbound: async (input) => {
        historyInput = input;
        return createPromptHistorySelection([], {
          selectionMode: "stale_reset_empty",
        });
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        promptHistory = input.conversation?.recentTurns;
        expect(input.conversation?.historyDiagnostics).toEqual({
          selectionMode: "stale_reset_empty",
          usedQuotedReference: false,
        });
        return createCatalogChatResult("Assistant reply", input.userMessage);
      },
    };
    const { logger } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage(), createContext(outbound));

    expect(historyInput).toEqual({
      companyId: "company-1",
      conversationId: "conversation-1",
      inboundTimestamp: 1_700_000_000_000,
      currentTransportMessageId: "message-1",
      limit: 20,
    });
    expect(promptHistory).toEqual([]);
  });

  test("passes quoted reply metadata through inbound persistence and history selection", async () => {
    const captured: Record<string, unknown>[] = [];
    const store = createStore({
      appendInboundCustomerMessage: async (input) => {
        captured.push({
          step: "appendInboundCustomerMessage",
          transportMessageId: input.transportMessageId,
          referencedTransportMessageId: input.referencedTransportMessageId,
        });
        return {
          conversation: {
            id: "conversation-1",
            companyId: input.companyId,
            phoneNumber: input.phoneNumber,
            muted: false,
          },
          wasMuted: false,
          wasDuplicate: false,
        };
      },
      getPromptHistoryForInbound: async (input) => {
        captured.push({
          step: "getPromptHistoryForInbound",
          currentTransportMessageId: input.currentTransportMessageId,
          referencedTransportMessageId: input.referencedTransportMessageId,
        });
        return createPromptHistorySelection(
          [{ role: "assistant", text: "older answer" }],
          {
            selectionMode: "quoted_reference_window",
            usedQuotedReference: true,
          },
        );
      },
    });
    const orchestrator: CatalogChatOrchestrator = {
      respond: async (input) => {
        orchestratorInput = input;
        return createCatalogChatResult("Assistant reply", input.userMessage);
      },
    };
    let orchestratorInput: Parameters<CatalogChatOrchestrator["respond"]>[0] | undefined;
    const { logger } = createLogger();
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
    });

    await router(createMessage({
      replyContext: {
        referencedMessageId: "quoted-message-1",
      },
    }), createContext(outbound));

    expect(captured).toEqual([
      {
        step: "appendInboundCustomerMessage",
        transportMessageId: "message-1",
        referencedTransportMessageId: "quoted-message-1",
      },
      {
        step: "getPromptHistoryForInbound",
        currentTransportMessageId: "message-1",
        referencedTransportMessageId: "quoted-message-1",
      },
    ]);
    expect(orchestratorInput?.conversation?.historyDiagnostics).toEqual({
      selectionMode: "quoted_reference_window",
      usedQuotedReference: true,
    });
  });

  test("logs and stops when outbound is unavailable", async () => {
    let usedRouterDependencies = false;
    const store = createStore({
      appendPendingAssistantMessage: async () => {
        usedRouterDependencies = true;
        throw new Error("should not run");
      },
      appendInboundCustomerMessage: async () => {
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

  test("redacts owner phone numbers in handoff notification error logs", async () => {
    const store = createStore({
      appendInboundCustomerMessage: async (input) => ({
        conversation: {
          id: "conversation-1",
          companyId: input.companyId,
          phoneNumber: input.phoneNumber,
          muted: false,
        },
        wasMuted: false,
        wasDuplicate: false,
      }),
      appendPendingAssistantMessage: async (input) => ({
        id: "pending-handoff-1",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        timestamp: input.timestamp,
        deliveryState: "pending",
      }),
      commitPendingAssistantMessage: async (input) => ({
        id: input.conversationId,
        companyId: input.companyId,
        phoneNumber: "967700000001",
        muted: true,
        mutedAt: 2_000,
        nextAutoResumeAt: 3_000,
      }),
      listRecentMessages: async () => {
        throw new Error("history failed");
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
    const { outbound } = createOutbound();
    const router = createCustomerConversationRouter({
      catalogChatOrchestrator: orchestrator,
      conversationStore: store,
      logger,
      now: () => 2_000,
    });

    await router(createMessage(), createContext(outbound));

    expect(errorCalls.at(-1)).toEqual({
      payload: expect.objectContaining({
        ownerPhoneNumber: "***0000",
      }),
      message: "customer conversation owner handoff notification failed",
    });
  });
});
