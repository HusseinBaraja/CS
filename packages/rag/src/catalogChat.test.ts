import { describe, expect, test } from 'bun:test';
import {
  createChatProviderManager,
  type ChatProviderHealth,
  type ChatProviderName,
  type PromptAssemblyInput,
  type PromptAssemblyOutput,
  type ChatResponse,
  type ChatRuntimeConfig,
} from '@cs/ai';
import type { Id } from '@cs/db';
import type { ResolvedUserTurn, TurnResolutionPolicy } from '@cs/shared';
import type { CatalogChatLogger, ProductRetrievalService, RetrieveCatalogContextResult } from './index';
import { createCatalogChatOrchestrator } from './index';

const COMPANY_ID = "company-1" as Id<"companies">;
const DEFAULT_RESOLUTION_POLICY: TurnResolutionPolicy = {
  allowModelAssistedFallback: false,
  allowSemanticAssistantFallback: true,
  allowSummarySupport: true,
  staleContextWindowMs: 1_800_000,
  quotedReferenceOverridesStaleness: true,
  minimumConfidenceToProceed: "high",
  allowMediumConfidenceProceed: false,
  maxSemanticFallbackDepth: 3,
};

const groundedRetrievalResult = (
  overrides: Partial<RetrieveCatalogContextResult> = {},
): RetrieveCatalogContextResult => ({
  outcome: "grounded",
  query: "Burger Box",
  language: "en",
  topScore: 0.92,
  candidates: [
    {
      productId: "product-1",
      score: 0.92,
      matchedEmbeddingId: "embedding-1",
      matchedText: "Burger box hit",
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
    },
  ],
  contextBlocks: [
    {
      id: "product-1",
      heading: "Burger Box",
      body: "Name (EN): Burger Box",
    },
  ],
  ...overrides,
});

const createRetrievalService = (
  result: RetrieveCatalogContextResult,
  calls: Array<unknown> = [],
): ProductRetrievalService => ({
  async retrieveCatalogContext(input) {
    calls.push(input);
    return result;
  },
});

const createChatManagerStub = (
  handler: (
    request: unknown,
    options: Record<string, unknown> | undefined,
  ) => Promise<ChatResponse>,
  calls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [],
) => ({
  chat: async (request: unknown, options?: Record<string, unknown>) => {
    calls.push({ request, options });
    return handler(request, options);
  },
  probeProviders: async (): Promise<ChatProviderHealth[]> => [],
});

const createLoggerStub = (): {
  logger: CatalogChatLogger;
  infoCalls: Array<{ payload: Record<string, unknown>; message: string }>;
  errorCalls: Array<{ payload: Record<string, unknown>; message: string }>;
} => {
  const infoCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const errorCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];

  return {
    logger: {
      debug() {
        return undefined;
      },
      info(payload, message) {
        infoCalls.push({ payload, message });
      },
      warn() {
        return undefined;
      },
      error(payload, message) {
        errorCalls.push({ payload, message });
      },
    },
    infoCalls,
    errorCalls,
  };
};

const findLoggedEvent = (
  calls: Array<{ payload: Record<string, unknown>; message: string }>,
  eventName: string,
) => calls.find((call) => call.payload.event === eventName);

const createResolvedTurn = (
  overrides: Partial<ResolvedUserTurn> = {},
): ResolvedUserTurn => ({
  rawInboundText: "Burger Box",
  normalizedInboundText: "Burger Box",
  resolvedIntent: "catalog_search",
  preferredRetrievalMode: "semantic_catalog_search",
  queryStatus: "resolved_passthrough",
  standaloneQuery: "Burger Box",
  passthroughReason: "already_standalone",
  presentedListTarget: null,
  referencedEntities: [],
  primaryEntityId: null,
  resolutionConfidence: "high",
  clarificationRequired: false,
  clarification: null,
  selectedResolutionSource: "raw_text",
  provenance: {
    selectedSources: [{ source: "raw_text", evidence: [] }],
    supportingSources: [],
    conflictingSources: [],
    discardedSources: [],
  },
  language: "en",
  ...overrides,
});

const runtimeConfig: ChatRuntimeConfig = {
  providerOrder: ["deepseek", "gemini"],
  requestTimeoutMs: 10_000,
  healthcheckTimeoutMs: 5_000,
  maxRetriesPerProvider: 0,
  providers: {
    deepseek: {
      apiKey: "deepseek-key",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.example/v1",
    },
    gemini: {
      apiKey: "gemini-key",
      model: "gemini-2.0-flash",
    },
    groq: {
      apiKey: "groq-key",
      model: "llama-3.3-70b-versatile",
    },
  },
};

const createFailoverChatManager = (
  calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }>,
) =>
  createChatProviderManager({
    runtimeConfig,
    resolveAdapter: (provider) => ({
      provider,
      async chat() {
        calls.push({ provider, kind: "chat" });
        if (provider === "deepseek") {
          throw new Error("primary unavailable");
        }

        return {
          provider,
          model: "gemini-2.0-flash",
          text: '{"schemaVersion":"v1","text":"Here are the burger boxes.","action":{"type":"none"}}',
          finishReason: "stop",
        };
      },
      async healthCheck() {
        calls.push({ provider, kind: "healthCheck" });
        return {
          provider,
          ok: true,
          model: runtimeConfig.providers[provider].model,
        };
      },
    }),
  });

const createPromptAssemblyOutputStub = (
  input: PromptAssemblyInput,
): PromptAssemblyOutput => ({
  messages: [
    {
      role: "system",
      content: "system",
    },
    {
      role: "user",
      content: "user",
    },
  ],
  layerMetadata: [
    {
      layer: "behavior_instructions",
      present: true,
      messageRole: "system",
      itemCount: 1,
      charCount: 6,
      truncated: false,
    },
    {
      layer: "conversation_summary",
      present: Boolean(input.conversationSummary),
      messageRole: "system",
      itemCount: input.conversationSummary ? 1 : 0,
      charCount: input.conversationSummary ? 7 : 0,
      truncated: false,
    },
    {
      layer: "conversation_state",
      present: Boolean(input.conversationState),
      messageRole: "system",
      itemCount: input.conversationState ? 1 : 0,
      charCount: input.conversationState ? 5 : 0,
      truncated: false,
    },
    {
      layer: "recent_turns",
      present: input.recentTurns.length > 0,
      messageRole: "mixed",
      itemCount: input.recentTurns.length,
      charCount: input.recentTurns.reduce((total, turn) => total + turn.text.length, 0),
      truncated: false,
    },
    {
      layer: "grounding_facts",
      present: Boolean(input.groundingBundle),
      messageRole: "user",
      itemCount: input.groundingBundle?.contextBlocks.length ?? 0,
      charCount: input.groundingBundle?.contextBlocks.reduce((total, block) => total + block.body.length, 0) ?? 0,
      truncated: false,
    },
    {
      layer: "current_user_turn",
      present: true,
      messageRole: "user",
      itemCount: 1,
      charCount: input.currentUserTurn.rawText.length,
      truncated: false,
    },
  ],
  tokenBudgetByLayer: {
    behavior_instructions: { layer: "behavior_instructions", maxTokens: null },
    conversation_summary: { layer: "conversation_summary", maxTokens: null },
    conversation_state: { layer: "conversation_state", maxTokens: null },
    recent_turns: { layer: "recent_turns", maxTokens: null },
    grounding_facts: { layer: "grounding_facts", maxTokens: null },
    current_user_turn: { layer: "current_user_turn", maxTokens: null },
  },
  omittedContext: [],
});

describe("createCatalogChatOrchestrator", () => {
  test("returns a grounded provider response when retrieval is grounded and output parses cleanly", async () => {
    const retrievalCalls: unknown[] = [];
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult(), retrievalCalls),
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        model: "gemini-2.0-flash",
        text: '{"schemaVersion":"v1","text":"We have burger boxes available.","action":{"type":"none"}}',
        finishReason: "stop",
        responseId: "resp-1",
      }), chatCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "Do you have burger boxes?",
    });

    expect(result).toEqual({
      outcome: "provider_response",
      assistant: {
        schemaVersion: "v1",
        text: "We have burger boxes available.",
        action: {
          type: "none",
        },
      },
      language: expect.objectContaining({
        responseLanguage: "en",
      }),
      retrieval: groundedRetrievalResult(),
      provider: {
        provider: "gemini",
        model: "gemini-2.0-flash",
        finishReason: "stop",
        usage: undefined,
        responseId: "resp-1",
      },
    });
    expect(retrievalCalls).toHaveLength(1);
    expect(chatCalls).toHaveLength(1);
  });

  test("preserves detected Arabic response language through retrieval and prompt assembly", async () => {
    const retrievalCalls: Array<Record<string, unknown>> = [];
    let promptInput: Record<string, unknown> | undefined;
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(
        groundedRetrievalResult({
          language: "ar",
          query: "علبة برجر",
          contextBlocks: [
            {
              id: "product-1",
              heading: "علبة برجر",
              body: "Name (AR): علبة برجر",
            },
          ],
        }),
        retrievalCalls,
      ),
      buildPrompt: (input: PromptAssemblyInput) => {
        promptInput = input as unknown as Record<string, unknown>;
        return createPromptAssemblyOutputStub(input);
      },
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"لدينا علب برجر.","action":{"type":"none"}}',
        finishReason: "stop",
      })),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "عندكم علب برجر؟",
      retrieval: {
        maxResults: 2,
        maxContextBlocks: 1,
        minScore: 0.8,
      },
    });

    expect((retrievalCalls[0] as { language: string }).language).toBe("ar");
    expect((retrievalCalls[0] as { maxResults: number }).maxResults).toBe(2);
    expect((retrievalCalls[0] as { maxContextBlocks: number }).maxContextBlocks).toBe(1);
    expect((retrievalCalls[0] as { minScore: number }).minScore).toBe(0.8);
    expect(promptInput?.behaviorInstructions).toEqual(expect.objectContaining({
      responseLanguage: "ar",
    }));
    expect(promptInput?.groundingBundle).toEqual(expect.objectContaining({
      retrievalMode: "semantic_catalog_search",
      resolvedQuery: "علبة برجر",
    }));
    expect(promptInput?.currentUserTurn).toEqual(expect.objectContaining({
      rawText: "عندكم علب برجر؟",
      resolvedTurn: expect.objectContaining({
        resolvedIntent: "catalog_search",
        standaloneQuery: "عندكم علب برجر؟",
        selectedResolutionSource: "raw_text",
      }),
    }));
    expect(result.language.responseLanguage).toBe("ar");
  });

  test("uses the resolved standalone query for retrieval and passes resolved-turn metadata into prompt assembly", async () => {
    const retrievalCalls: unknown[] = [];
    let promptInput: PromptAssemblyInput | undefined;
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult(), retrievalCalls),
      resolveTurn: async () => createResolvedTurn({
        rawInboundText: "what sizes does it come in",
        normalizedInboundText: "what sizes does it come in",
        resolvedIntent: "entity_followup",
        standaloneQuery: "What sizes does Burger Box come in?",
        queryStatus: "rewritten",
        selectedResolutionSource: "current_focus",
        referencedEntities: [{
          entityKind: "product",
          entityId: "product-1",
          source: "current_focus",
          confidence: "high",
        }],
      }),
      buildPrompt: (input: PromptAssemblyInput) => {
        promptInput = input;
        return createPromptAssemblyOutputStub(input);
      },
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"Burger Box comes in S, M, and L.","action":{"type":"none"}}',
        finishReason: "stop",
      })),
    });

    await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        resolutionPolicy: DEFAULT_RESOLUTION_POLICY,
      },
      userMessage: "what sizes does it come in",
    });

    expect(retrievalCalls).toEqual([
      expect.objectContaining({
        query: "What sizes does Burger Box come in?",
        language: "en",
      }),
    ]);
    expect(promptInput?.currentUserTurn).toEqual(expect.objectContaining({
      rawText: "what sizes does it come in",
      resolvedTurn: expect.objectContaining({
        resolvedIntent: "entity_followup",
        standaloneQuery: "What sizes does Burger Box come in?",
        referencedEntities: [
          expect.objectContaining({
            entityId: "product-1",
            source: "current_focus",
          }),
        ],
      }),
    }));
    expect(promptInput?.groundingBundle).toEqual(expect.objectContaining({
      retrievalMode: "semantic_catalog_search",
      resolvedQuery: "Burger Box",
    }));
  });

  test("short-circuits clarification-required resolutions before retrieval", async () => {
    const retrievalCalls: unknown[] = [];
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const { logger, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult(), retrievalCalls),
      resolveTurn: async () => createResolvedTurn({
        rawInboundText: "its picture",
        normalizedInboundText: "its picture",
        resolvedIntent: "ambiguous_unresolved",
        preferredRetrievalMode: "clarification_required",
        queryStatus: "not_applicable",
        standaloneQuery: null,
        passthroughReason: "clarification_short_circuit",
        clarificationRequired: true,
        resolutionConfidence: "low",
        clarification: {
          reason: "ambiguous_referent",
          target: "referent",
          suggestedPromptStrategy: "ask_for_name",
        },
      }),
      logger,
      chatManager: createChatManagerStub(async () => {
        throw new Error("should not be called");
      }, chatCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        resolutionPolicy: DEFAULT_RESOLUTION_POLICY,
      },
      requestId: "request-1",
      userMessage: "its picture",
    });

    expect(result.outcome).toBe("clarification_fallback");
    expect(result.assistant).toEqual({
      schemaVersion: "v1",
      text: "Which product do you mean?",
      action: {
        type: "clarify",
      },
    });
    expect(retrievalCalls).toHaveLength(0);
    expect(chatCalls).toHaveLength(0);
    expect(findLoggedEvent(infoCalls, "rag.turn_resolution.source_selection_recorded")).toMatchObject({
      payload: {
        preferredRetrievalMode: "clarification_required",
        clarificationRequired: true,
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.turn_resolution.clarification_short_circuit_recorded")).toMatchObject({
      payload: {
        preferredRetrievalMode: "clarification_required",
        clarificationReason: "ambiguous_referent",
      },
    });
  });

  test("logs shadow disagreement and clarifies when typed retrieval fallback has no safe standalone query", async () => {
    const retrievalCalls: unknown[] = [];
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const { logger, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult(), retrievalCalls),
      resolveTurn: async () => createResolvedTurn({
        rawInboundText: "show me its picture",
        normalizedInboundText: "show me its picture",
        resolvedIntent: "image_request",
        preferredRetrievalMode: "direct_entity_lookup",
        queryStatus: "not_applicable",
        standaloneQuery: null,
        referencedEntities: [{
          entityKind: "product",
          entityId: "product-1",
          source: "current_focus",
          confidence: "high",
        }],
        selectedResolutionSource: "current_focus",
        shadowModelAssistedResult: {
          agreedWithDeterministic: false,
          preferredRetrievalMode: "variant_lookup",
          resolutionConfidence: "medium",
        },
      }),
      logger,
      chatManager: createChatManagerStub(async () => {
        throw new Error("should not be called");
      }, chatCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        resolutionPolicy: DEFAULT_RESOLUTION_POLICY,
      },
      userMessage: "show me its picture",
    });

    expect(result.outcome).toBe("clarification_fallback");
    expect(retrievalCalls).toHaveLength(0);
    expect(chatCalls).toHaveLength(0);
    expect(findLoggedEvent(infoCalls, "rag.turn_resolution.shadow_disagreement_recorded")).toMatchObject({
      payload: {
        deterministicMode: "direct_entity_lookup",
        shadowMode: "variant_lookup",
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.turn_resolution.compatibility_fallback")).toMatchObject({
      payload: {
        preferredRetrievalMode: "direct_entity_lookup",
        hasStandaloneQuery: false,
        fallback: "clarification",
      },
    });
  });

  test("skips retrieval for unsupported turns and still invokes the provider with null grounding", async () => {
    const retrievalCalls: unknown[] = [];
    let promptInput: PromptAssemblyInput | undefined;
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult(), retrievalCalls),
      resolveTurn: async () => createResolvedTurn({
        rawInboundText: "tell me a joke",
        normalizedInboundText: "tell me a joke",
        resolvedIntent: "non_catalog_or_unsupported",
        preferredRetrievalMode: "skip_retrieval",
        queryStatus: "not_applicable",
        standaloneQuery: null,
      }),
      buildPrompt: (input: PromptAssemblyInput) => {
        promptInput = input;
        return createPromptAssemblyOutputStub(input);
      },
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"I can only help with catalog questions.","action":{"type":"none"}}',
        finishReason: "stop",
      }), chatCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        resolutionPolicy: DEFAULT_RESOLUTION_POLICY,
      },
      userMessage: "tell me a joke",
    });

    expect(result.outcome).toBe("provider_response");
    expect(retrievalCalls).toHaveLength(0);
    expect(chatCalls).toHaveLength(1);
    expect(promptInput?.groundingBundle).toBeNull();
    expect(promptInput?.currentUserTurn.resolvedTurn).toEqual(expect.objectContaining({
      resolvedIntent: "non_catalog_or_unsupported",
      selectedResolutionSource: "raw_text",
      standaloneQuery: null,
    }));
  });

  test("limits grounding bundle entities to products included in context blocks", async () => {
    let promptInput: PromptAssemblyInput | undefined;
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult({
        candidates: [
          {
            productId: "product-1",
            score: 0.92,
            matchedEmbeddingId: "embedding-1",
            matchedText: "Burger box hit",
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
              imageCount: 1,
              basePrice: 12,
              baseCurrency: "USD",
              variants: [],
            },
          },
          {
            productId: "product-2",
            score: 0.81,
            matchedEmbeddingId: "embedding-2",
            matchedText: "Tray hit",
            language: "en",
            contextBlock: {
              id: "product-2",
              heading: "Food Tray",
              body: "Name (EN): Food Tray",
            },
            product: {
              id: "product-2",
              categoryId: "category-2",
              nameEn: "Food Tray",
              imageCount: 3,
              basePrice: 20,
              baseCurrency: "USD",
              variants: [],
            },
          },
        ],
        contextBlocks: [
          {
            id: "product-1",
            heading: "Burger Box",
            body: "Name (EN): Burger Box",
          },
        ],
      })),
      buildPrompt: (input: PromptAssemblyInput) => {
        promptInput = input;
        return createPromptAssemblyOutputStub(input);
      },
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"We have burger boxes.","action":{"type":"none"}}',
        finishReason: "stop",
      })),
    });

    await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "Burger Box",
    });

    expect(promptInput?.groundingBundle).toEqual(expect.objectContaining({
      entityRefs: [
        {
          entityKind: "product",
          entityId: "product-1",
        },
      ],
      products: [
        {
          id: "product-1",
          name: "Burger Box",
        },
      ],
      pricingFacts: [
        {
          entityId: "product-1",
          kind: "base_price",
          value: 12,
          currency: "USD",
        },
      ],
      imageAvailability: [
        {
          entityId: "product-1",
          hasImages: true,
          imageCount: 1,
        },
      ],
    }));
  });

  test("skips provider invocation and returns a clarification fallback for blank input", async () => {
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const { logger, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService({
        outcome: "empty",
        reason: "empty_query",
        query: "",
        language: "en",
        candidates: [],
        contextBlocks: [],
      }),
      logger,
      chatManager: createChatManagerStub(async () => {
        throw new Error("should not be called");
      }, chatCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "   ",
    });

    expect(result).toEqual({
      outcome: "empty_query_fallback",
      assistant: {
        schemaVersion: "v1",
        text: "ما المنتج الذي تريد أن أساعِدك به؟",
        action: {
          type: "clarify",
        },
      },
      language: {
        classification: "unknown",
        responseLanguage: "ar",
        arabicCharCount: 0,
        englishCharCount: 0,
        hasArabic: false,
        hasEnglish: false,
      },
      retrieval: {
        outcome: "empty",
        reason: "empty_query",
        query: "",
        language: "ar",
        candidates: [],
        contextBlocks: [],
      },
    });
    expect(chatCalls).toHaveLength(0);
    expect(findLoggedEvent(infoCalls, "rag.retrieval.completed")).toMatchObject({
      message: "catalog retrieval completed",
      payload: {
        event: "rag.retrieval.completed",
        runtime: "rag",
        surface: "retrieval",
        outcome: "empty",
        retrieval: {
          outcome: "empty",
          reason: "empty_query",
          candidateCount: 0,
          contextBlockCount: 0,
          language: "ar",
        },
      },
    });
    const retrievalOutcomeLog = findLoggedEvent(infoCalls, "rag.retrieval.outcome_recorded");
    expect(retrievalOutcomeLog).toMatchObject({
      message: "catalog retrieval outcome recorded",
      payload: {
        event: "rag.retrieval.outcome_recorded",
        retrievalMode: "skip_retrieval",
        retrievalOutcome: "empty",
        candidateCount: 0,
        topScore: null,
        contextBlockCount: 0,
        fallbackChosen: "clarify",
      },
    });
    expect(retrievalOutcomeLog?.payload).not.toHaveProperty("conversationId");
    expect(retrievalOutcomeLog?.payload).not.toHaveProperty("requestId");
    const contextUsageLog = findLoggedEvent(infoCalls, "rag.context_usage.recorded");
    expect(contextUsageLog).toMatchObject({
      message: "catalog context usage recorded",
      payload: {
        event: "rag.context_usage.recorded",
        stage: "prompt_assembly",
        promptHistorySelectionMode: "no_history",
        usedRecentTurns: false,
        usedConversationState: false,
        usedSummary: false,
        usedQuotedReference: false,
        usedGroundingFacts: false,
      },
    });
    expect(contextUsageLog?.payload).not.toHaveProperty("conversationId");
    expect(contextUsageLog?.payload).not.toHaveProperty("requestId");
    const fallbackDecisionLog = findLoggedEvent(infoCalls, "rag.decision.recorded");
    expect(fallbackDecisionLog).toMatchObject({
      message: "catalog fallback decision recorded",
      payload: {
        event: "rag.decision.recorded",
        decisionType: "clarify",
        reason: "empty_query",
        precedingStage: "retrieval",
        resolutionConfidence: null,
        retrievalOutcome: "empty",
        providerOutcome: "not_requested",
      },
    });
    expect(fallbackDecisionLog?.payload).not.toHaveProperty("conversationId");
    expect(fallbackDecisionLog?.payload).not.toHaveProperty("requestId");
  });

  test("skips provider invocation on no_hits and returns a scope-safe fallback", async () => {
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const { logger, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService({
        outcome: "empty",
        reason: "no_hits",
        query: "bottle",
        language: "en",
        candidates: [],
        contextBlocks: [],
      }),
      logger,
      chatManager: createChatManagerStub(async () => {
        throw new Error("should not be called");
      }, chatCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "bottle",
    });

    expect(result.outcome).toBe("no_hits_fallback");
    expect(result.assistant).toEqual({
      schemaVersion: "v1",
      text: "I couldn't find a matching product in the current catalog.",
      action: {
        type: "none",
      },
    });
    expect(chatCalls).toHaveLength(0);
    expect(findLoggedEvent(infoCalls, "rag.retrieval.completed")).toMatchObject({
      payload: {
        event: "rag.retrieval.completed",
        outcome: "empty",
        retrieval: {
          reason: "no_hits",
        },
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.retrieval.outcome_recorded")).toMatchObject({
      payload: {
        event: "rag.retrieval.outcome_recorded",
        retrievalOutcome: "empty",
        fallbackChosen: "no_match_reply",
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.decision.recorded")).toMatchObject({
      payload: {
        event: "rag.decision.recorded",
        decisionType: "no_match_reply",
        reason: "no_hits",
        providerOutcome: "not_requested",
      },
    });
  });

  test("skips provider invocation on below_min_score and returns a low-signal fallback", async () => {
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const { logger, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService({
        outcome: "low_signal",
        reason: "below_min_score",
        query: "container",
        language: "en",
        topScore: 0.2,
        candidates: groundedRetrievalResult().candidates,
        contextBlocks: [],
      }),
      logger,
      chatManager: createChatManagerStub(async () => {
        throw new Error("should not be called");
      }, chatCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "container",
    });

    expect(result.outcome).toBe("low_signal_fallback");
    expect(result.assistant).toEqual({
      schemaVersion: "v1",
      text: "I couldn't confidently match your request to the current catalog.",
      action: {
        type: "none",
      },
    });
    expect(chatCalls).toHaveLength(0);
    expect(findLoggedEvent(infoCalls, "rag.retrieval.completed")).toMatchObject({
      payload: {
        event: "rag.retrieval.completed",
        outcome: "low_signal",
        retrieval: {
          topScore: 0.2,
        },
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.retrieval.outcome_recorded")).toMatchObject({
      payload: {
        event: "rag.retrieval.outcome_recorded",
        retrievalOutcome: "low_signal",
        fallbackChosen: "low_signal_reply",
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.decision.recorded")).toMatchObject({
      payload: {
        event: "rag.decision.recorded",
        decisionType: "low_signal_reply",
        reason: "below_min_score",
        providerOutcome: "not_requested",
      },
    });
  });

  test("survives a primary-provider failure and succeeds after failover", async () => {
    const providerCalls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      chatManager: createFailoverChatManager(providerCalls),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "Burger Box",
    });

    expect(result.outcome).toBe("provider_response");
    expect(result.assistant.text).toBe("Here are the burger boxes.");
    expect(result.provider?.provider).toBe("gemini");
    expect(providerCalls).toEqual([
      { provider: "deepseek", kind: "chat" },
      { provider: "gemini", kind: "chat" },
    ]);
  });

  test("returns a handoff fallback when all providers fail", async () => {
    const { logger, errorCalls, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      logger,
      chatManager: createChatManagerStub(async () => {
        throw new Error("all providers failed");
      }),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        conversationId: "conversation-1",
      },
      requestId: "request-1",
      userMessage: "Burger Box",
    });

    expect(findLoggedEvent(infoCalls, "rag.retrieval.completed")).toMatchObject({
      payload: {
        event: "rag.retrieval.completed",
        outcome: "grounded",
        requestId: "request-1",
        conversationId: "conversation-1",
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.retrieval.outcome_recorded")).toMatchObject({
      payload: {
        event: "rag.retrieval.outcome_recorded",
        conversationId: "conversation-1",
        requestId: "request-1",
        retrievalOutcome: "grounded",
        fallbackChosen: null,
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.context_usage.recorded")).toMatchObject({
      payload: {
        event: "rag.context_usage.recorded",
        conversationId: "conversation-1",
        requestId: "request-1",
        promptHistorySelectionMode: "no_history",
        usedGroundingFacts: true,
      },
    });
    expect(result).toMatchObject({
      outcome: "provider_failure_fallback",
      assistant: {
        schemaVersion: "v1",
        text: "I can't help safely right now, so I'll connect you with the team.",
        action: {
          type: "handoff",
        },
      },
    });
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]).toMatchObject({
      message: "catalog chat provider fallback selected",
      payload: {
        event: "rag.catalog_chat.provider_fallback",
        runtime: "rag",
        surface: "orchestrator",
        outcome: "provider_failure_fallback",
        companyId: COMPANY_ID,
        conversationId: "conversation-1",
        requestId: "request-1",
        responseLanguage: "en",
        retrieval: {
          outcome: "grounded",
          topScore: 0.92,
          candidateCount: 1,
          contextBlockCount: 1,
          language: "en",
        },
        error: {
          name: "Error",
          message: "all providers failed",
          stack: expect.any(String),
        },
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.decision.recorded")).toMatchObject({
      payload: {
        event: "rag.decision.recorded",
        conversationId: "conversation-1",
        requestId: "request-1",
        decisionType: "handoff",
        reason: "provider_failure",
        precedingStage: "assistant",
        retrievalOutcome: "grounded",
        providerOutcome: "provider_failure",
      },
    });
  });

  test("returns a handoff fallback when provider text is invalid JSON", async () => {
    const { logger, errorCalls, infoCalls } = createLoggerStub();
    const invalidText = "{".repeat(600);
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      logger,
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        model: "gemini-2.0-flash",
        text: invalidText,
        finishReason: "stop",
        responseId: "resp-invalid",
      })),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      userMessage: "Burger Box",
    });

    expect(result).toMatchObject({
      outcome: "invalid_model_output_fallback",
      assistant: {
        schemaVersion: "v1",
        text: "I can't help safely right now, so I'll connect you with the team.",
        action: {
          type: "handoff",
        },
      },
      provider: {
        provider: "gemini",
        model: "gemini-2.0-flash",
        responseId: "resp-invalid",
      },
    });
    expect(infoCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          event: "rag.retrieval.completed",
          outcome: "grounded",
        }),
      }),
    ]));
    const structuredOutputFailureLog = findLoggedEvent(errorCalls, "rag.structured_output.failure_recorded");
    expect(structuredOutputFailureLog).toMatchObject({
      message: "catalog structured output failure recorded",
      payload: {
        event: "rag.structured_output.failure_recorded",
        provider: "gemini",
        model: "gemini-2.0-flash",
        failureKind: "invalid_json",
        repairAttempted: false,
        fallbackChosen: "handoff",
      },
    });
    expect(structuredOutputFailureLog?.payload).not.toHaveProperty("conversationId");
    expect(structuredOutputFailureLog?.payload).not.toHaveProperty("requestId");
    expect(findLoggedEvent(infoCalls, "rag.decision.recorded")).toMatchObject({
      message: "catalog fallback decision recorded",
      payload: {
        event: "rag.decision.recorded",
        decisionType: "handoff",
        reason: "invalid_json",
        precedingStage: "assistant",
        retrievalOutcome: "grounded",
        providerOutcome: "invalid_model_output",
      },
    });
    expect(findLoggedEvent(errorCalls, "rag.catalog_chat.parse_failed")).toMatchObject({
      message: "catalog chat structured output parsing failed",
      payload: {
      event: "rag.catalog_chat.parse_failed",
      runtime: "rag",
      surface: "orchestrator",
      outcome: "invalid_model_output_fallback",
      companyId: COMPANY_ID,
      responseLanguage: "en",
      retrieval: {
        outcome: "grounded",
        topScore: 0.92,
        candidateCount: 1,
        contextBlockCount: 1,
        language: "en",
      },
      provider: {
        provider: "gemini",
        model: "gemini-2.0-flash",
        finishReason: "stop",
        responseId: "resp-invalid",
      },
      providerTextLength: 600,
      providerTextLineCount: 1,
      error: {
        name: "StructuredOutputParseError",
        message: "Assistant structured output must be valid JSON",
      },
    }});
    const serializedLogs = JSON.stringify({
      infoCalls,
      errorCalls,
    });
    expect(serializedLogs).not.toContain(invalidText);
    expect(serializedLogs).not.toContain("unknown_conversation");
    expect(serializedLogs).not.toContain("unknown_request");
  });

  test("forwards conversation and request metadata into the chat-manager log context", async () => {
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const { logger } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      logger,
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"We have burger boxes.","action":{"type":"none"}}',
        finishReason: "stop",
      }), chatCalls),
    });

    await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        conversationId: "conversation-1",
      },
      requestId: "request-1",
      userMessage: "Burger Box",
      provider: {
        timeoutMs: 2_500,
        maxRetriesPerProvider: 2,
      },
    });

    expect(chatCalls[0]?.options).toEqual({
      signal: undefined,
      timeoutMs: 2_500,
      maxRetriesPerProvider: 2,
      logger: expect.any(Object),
      logContext: {
        companyId: COMPANY_ID,
        conversationId: "conversation-1",
        requestId: "request-1",
        feature: "catalog_chat",
      },
    });
  });

  test("passes caller-supplied history unchanged into prompt assembly", async () => {
    let promptInput: Record<string, unknown> | undefined;
    const recentTurns = [
      {
        role: "user" as const,
        text: "Hello",
      },
      {
        role: "assistant" as const,
        text: "Hi there",
      },
    ];
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      buildPrompt: (input: PromptAssemblyInput) => {
        promptInput = input as unknown as Record<string, unknown>;
        return createPromptAssemblyOutputStub(input);
      },
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"We have burger boxes.","action":{"type":"none"}}',
        finishReason: "stop",
      })),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        recentTurns,
        allowedActions: ["none", "clarify"],
      },
      userMessage: "Burger Box",
    });

    expect(promptInput?.recentTurns).toEqual(recentTurns);
    expect(promptInput?.behaviorInstructions).toEqual(expect.objectContaining({
      allowedActions: ["none", "clarify"],
    }));
    expect(result.assistant.action.type).toBe("none");
  });

  test("accepts canonical conversation state without making it authoritative in step 1", async () => {
    const { logger, infoCalls } = createLoggerStub();
    let promptInput: Record<string, unknown> | undefined;
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      logger,
      buildPrompt: (input: PromptAssemblyInput) => {
        promptInput = input as unknown as Record<string, unknown>;
        return createPromptAssemblyOutputStub(input);
      },
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"We have burger boxes.","action":{"type":"none"}}',
        finishReason: "stop",
      })),
    });

    await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        conversationId: "conversation-1",
        recentTurns: [
          {
            role: "user",
            text: "Show me burger boxes",
          },
        ],
        canonicalState: {
          schemaVersion: "v1",
          conversationId: "conversation-1",
          companyId: "company-1",
          responseLanguage: "en",
          currentFocus: {
            kind: "product",
            entityIds: ["product-1"],
            source: "retrieval_single_candidate",
            updatedAt: 1_000,
          },
          pendingClarification: {
            active: false,
          },
          freshness: {
            status: "fresh",
            updatedAt: 1_000,
            activeWindowExpiresAt: 31_000,
          },
          sourceOfTruthMarkers: {
            currentFocus: "retrieval_single_candidate",
          },
          heuristicHints: {
            usedQuotedReference: false,
            topCandidates: [],
          },
        },
      },
      requestId: "request-1",
      userMessage: "Burger Box",
    });

    expect(promptInput?.recentTurns).toEqual([
      {
        role: "user",
        text: "Show me burger boxes",
      },
    ]);
    expect(findLoggedEvent(infoCalls, "rag.context_usage.recorded")).toMatchObject({
      payload: {
        event: "rag.context_usage.recorded",
        conversationId: "conversation-1",
        requestId: "request-1",
        usedConversationState: true,
      },
    });
  });

  test("records fallback mismatches when retrieval falls back despite canonical recoverable context", async () => {
    const { logger, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService({
        outcome: "low_signal",
        reason: "below_min_score",
        query: "what sizes does it come in",
        language: "en",
        topScore: 0.2,
        candidates: groundedRetrievalResult().candidates,
        contextBlocks: [],
      }),
      logger,
      chatManager: createChatManagerStub(async () => {
        throw new Error("should not be called");
      }),
    });

    await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        conversationId: "conversation-1",
        canonicalState: {
          schemaVersion: "v1",
          conversationId: "conversation-1",
          companyId: "company-1",
          responseLanguage: "en",
          currentFocus: {
            kind: "product",
            entityIds: ["product-1"],
            source: "retrieval_single_candidate",
            updatedAt: 1_000,
          },
          pendingClarification: {
            active: false,
          },
          freshness: {
            status: "fresh",
            updatedAt: 1_000,
            activeWindowExpiresAt: 31_000,
          },
          latestStandaloneQuery: {
            text: "Burger Box",
            status: "unresolved_passthrough",
            source: "retrieval_single_candidate",
            updatedAt: 1_000,
          },
          sourceOfTruthMarkers: {
            currentFocus: "retrieval_single_candidate",
            latestStandaloneQuery: "retrieval_single_candidate",
          },
          heuristicHints: {
            promptHistorySelectionMode: "quoted_reference_window",
            usedQuotedReference: true,
            topCandidates: [
              {
                entityKind: "product",
                entityId: "product-1",
                score: 0.92,
              },
            ],
          },
        },
        historyDiagnostics: {
          selectionMode: "quoted_reference_window",
          usedQuotedReference: true,
        },
      },
      requestId: "request-1",
      userMessage: "what sizes does it come in",
    });

    expect(findLoggedEvent(infoCalls, "conversation.canonical_state.fallback_mismatch_recorded")).toMatchObject({
      message: "catalog canonical state fallback mismatch recorded",
      payload: {
        event: "conversation.canonical_state.fallback_mismatch_recorded",
        runtime: "rag",
        surface: "orchestrator",
        outcome: "recorded",
        conversationId: "conversation-1",
        requestId: "request-1",
        retrievalOutcome: "low_signal",
        freshnessStatus: "fresh",
        promptHistorySelectionMode: "quoted_reference_window",
        authoritativeFocusKind: "product",
        authoritativeFocusSource: "retrieval_single_candidate",
        heuristicCandidateCount: 1,
      },
    });
  });

  test("records assistant clarify actions and quoted-reference context diagnostics", async () => {
    const { logger, infoCalls } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      logger,
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"Which size do you want?","action":{"type":"clarify"}}',
        finishReason: "stop",
      })),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        conversationId: "conversation-1",
        recentTurns: [
          {
            role: "user",
            text: "Show me the burger boxes",
          },
        ],
        canonicalState: {
          schemaVersion: "v1",
          conversationId: "conversation-1",
          companyId: "company-1",
          responseLanguage: "en",
          currentFocus: {
            kind: "product",
            entityIds: ["product-1"],
            source: "retrieval_single_candidate",
            updatedAt: 1_000,
          },
          pendingClarification: {
            active: false,
          },
          latestStandaloneQuery: {
            text: "Burger Box",
            status: "unresolved_passthrough",
            source: "retrieval_single_candidate",
            updatedAt: 1_000,
          },
          freshness: {
            status: "fresh",
            updatedAt: 1_000,
            activeWindowExpiresAt: 31_000,
          },
          sourceOfTruthMarkers: {
            currentFocus: "retrieval_single_candidate",
            latestStandaloneQuery: "retrieval_single_candidate",
          },
          heuristicHints: {
            usedQuotedReference: true,
            topCandidates: [],
          },
        },
        historyDiagnostics: {
          selectionMode: "quoted_reference_window",
          usedQuotedReference: true,
        },
      },
      requestId: "request-1",
      userMessage: "What sizes does it come in?",
    });

    expect(result.outcome).toBe("provider_response");
    expect(result.assistant.action.type).toBe("clarify");
    expect(findLoggedEvent(infoCalls, "rag.context_usage.recorded")).toMatchObject({
      payload: {
        event: "rag.context_usage.recorded",
        conversationId: "conversation-1",
        requestId: "request-1",
        promptHistorySelectionMode: "quoted_reference_window",
        usedRecentTurns: true,
        usedQuotedReference: true,
        usedGroundingFacts: true,
      },
    });
    expect(findLoggedEvent(infoCalls, "rag.decision.recorded")).toMatchObject({
      payload: {
        event: "rag.decision.recorded",
        conversationId: "conversation-1",
        requestId: "request-1",
        decisionType: "clarify",
        reason: "assistant_action",
        precedingStage: "assistant",
        retrievalOutcome: "grounded",
        providerOutcome: "response_received",
      },
    });
  });
});
