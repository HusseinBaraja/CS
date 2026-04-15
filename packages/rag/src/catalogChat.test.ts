import { describe, expect, test } from 'bun:test';
import {
  createChatProviderManager,
  type ChatProviderHealth,
  type ChatProviderName,
  type ChatResponse,
  type ChatRuntimeConfig,
} from '@cs/ai';
import type { Id } from '@cs/db';
import type {
  CatalogChatLogger,
  ProductRetrievalService,
  RetrieveCatalogContextResult,
  RetrievalRewriteAttempt,
  RetrievalRewriteService,
} from './index';
import { createCatalogChatOrchestrator } from './index';

const COMPANY_ID = "company-1" as Id<"companies">;

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
    return {
      ...result,
      query: input.query,
      language: input.language,
    };
  },
});

const highConfidenceRewriteAttempt = (
  overrides: Partial<Extract<RetrievalRewriteAttempt, { status: "success" }>["result"]> = {},
): RetrievalRewriteAttempt => ({
  status: "success",
  result: {
    resolvedQuery: "Burger Box",
    confidence: "high",
    rewriteStrategy: "standalone",
    preservedTerms: ["Burger Box"],
    ...overrides,
  },
});

const createRewriteService = (
  result: RetrievalRewriteAttempt,
  calls: Array<unknown> = [],
): RetrievalRewriteService => ({
  async rewrite(input) {
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

describe("createCatalogChatOrchestrator", () => {
  test("returns a grounded provider response when retrieval is grounded and output parses cleanly", async () => {
    const retrievalCalls: unknown[] = [];
    const rewriteCalls: unknown[] = [];
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult(), retrievalCalls),
      rewriteService: createRewriteService(highConfidenceRewriteAttempt(), rewriteCalls),
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

    expect(result).toMatchObject({
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
      retrieval: {
        ...groundedRetrievalResult(),
        retrievalMode: "primary_rewrite",
      },
      retrievalMode: "primary_rewrite",
      rewrite: highConfidenceRewriteAttempt(),
      provider: {
        provider: "gemini",
        model: "gemini-2.0-flash",
        finishReason: "stop",
        usage: undefined,
        responseId: "resp-1",
      },
    });
    expect(rewriteCalls).toHaveLength(1);
    expect(retrievalCalls).toHaveLength(1);
    expect(retrievalCalls[0]).toMatchObject({
      query: "Burger Box",
    });
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
      rewriteService: createRewriteService(
        highConfidenceRewriteAttempt({
          resolvedQuery: "علبة برجر",
          preservedTerms: ["علبة برجر"],
        }),
      ),
      buildPrompt: (input) => {
        promptInput = input as unknown as Record<string, unknown>;
        return {
          systemPrompt: "system",
          userPrompt: "user",
          request: {
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
          },
        };
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
    expect((retrievalCalls[0] as { query: string }).query).toBe("علبة برجر");
    expect((retrievalCalls[0] as { maxResults: number }).maxResults).toBe(2);
    expect((retrievalCalls[0] as { maxContextBlocks: number }).maxContextBlocks).toBe(1);
    expect((retrievalCalls[0] as { minScore: number }).minScore).toBe(0.8);
    expect(promptInput?.responseLanguage).toBe("ar");
    expect(promptInput?.retrievalMode).toBe("primary_rewrite");
    expect(promptInput?.retrievalProvenance).toEqual({
      mode: "primary_rewrite",
      primarySource: "resolved_query",
      supportingSources: [],
      usedAliasCount: 0,
      convergedOnSharedProducts: false,
    });
    expect(result.retrievalMode).toBe("primary_rewrite");
    expect(result.language.responseLanguage).toBe("ar");
  });

  test("uses degraded retrieval queries when rewrite confidence is low and passes degraded provenance into the prompt", async () => {
    const retrievalCalls: Array<Record<string, unknown>> = [];
    let promptInput: Record<string, unknown> | undefined;
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult(), retrievalCalls),
      rewriteService: createRewriteService({
        status: "failure",
        failureReason: "low_confidence",
        result: {
          resolvedQuery: "Burger Box Large",
          confidence: "low",
          rewriteStrategy: "quoted_reply_resolution",
          preservedTerms: ["Burger Box", "Large"],
        },
      }),
      buildPrompt: (input) => {
        promptInput = input as unknown as Record<string, unknown>;
        return {
          systemPrompt: "system",
          userPrompt: "user",
          request: {
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
          },
        };
      },
      chatManager: createChatManagerStub(async () => ({
        provider: "gemini",
        text: '{"schemaVersion":"v1","text":"Please confirm which burger box you mean.","action":{"type":"clarify"}}',
        finishReason: "stop",
      })),
    });

    const result = await orchestrator.respond({
      tenant: {
        companyId: COMPANY_ID,
      },
      conversation: {
        history: [
          {
            role: "assistant",
            text: "Burger Box Large",
          },
        ],
        historySelection: {
          reason: "quoted_reply_slice",
          quotedMessage: {
            role: "assistant",
            text: "Burger Box Large",
          },
        },
      },
      userMessage: "How much is this one?",
    });

    expect(retrievalCalls.map((call) => call.query)).toEqual([
      "How much is this one?",
      "Burger Box Large\nHow much is this one?",
    ]);
    expect(promptInput?.retrievalMode).toBe("rewrite_degraded");
    expect(promptInput?.retrievalProvenance).toEqual({
      mode: "rewrite_degraded",
      primarySource: "original_message_fallback",
      supportingSources: ["quoted_message_fallback"],
      usedAliasCount: 0,
      convergedOnSharedProducts: true,
    });
    expect(result.retrievalMode).toBe("rewrite_degraded");
    expect(result.rewrite).toEqual({
      status: "failure",
      failureReason: "low_confidence",
      result: {
        resolvedQuery: "Burger Box Large",
        confidence: "low",
        rewriteStrategy: "quoted_reply_resolution",
        preservedTerms: ["Burger Box", "Large"],
      },
    });
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
      rewriteService: createRewriteService({
        status: "failure",
        failureReason: "provider_error",
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
        retrievalMode: "rewrite_degraded",
      },
      retrievalMode: "rewrite_degraded",
      rewrite: {
        status: "failure",
        failureReason: "provider_error",
      },
    });
    expect(chatCalls).toHaveLength(0);
    expect(infoCalls[0]).toMatchObject({
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
      rewriteService: createRewriteService(
        highConfidenceRewriteAttempt({
          resolvedQuery: "bottle",
          preservedTerms: ["bottle"],
        }),
      ),
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
    expect(infoCalls[0]).toMatchObject({
      payload: {
        event: "rag.retrieval.completed",
        outcome: "empty",
        retrieval: {
          reason: "no_hits",
        },
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
        candidates: [
          {
            ...groundedRetrievalResult().candidates[0]!,
            score: 0.2,
          },
        ],
        contextBlocks: [],
      }),
      rewriteService: createRewriteService(
        highConfidenceRewriteAttempt({
          resolvedQuery: "container",
          preservedTerms: ["container"],
        }),
      ),
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
    expect(infoCalls[0]).toMatchObject({
      payload: {
        event: "rag.retrieval.completed",
        outcome: "low_signal",
        retrieval: {
          topScore: 0.2,
        },
      },
    });
  });

  test("survives a primary-provider failure and succeeds after failover", async () => {
    const providerCalls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      rewriteService: createRewriteService(highConfidenceRewriteAttempt()),
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
      rewriteService: createRewriteService(highConfidenceRewriteAttempt()),
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

    expect(infoCalls[0]).toMatchObject({
      payload: {
        event: "rag.retrieval.completed",
        outcome: "grounded",
        requestId: "request-1",
        conversationId: "conversation-1",
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
  });

  test("returns a handoff fallback when provider text is invalid JSON", async () => {
    const { logger, errorCalls, infoCalls } = createLoggerStub();
    const invalidText = "{".repeat(600);
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      rewriteService: createRewriteService(highConfidenceRewriteAttempt()),
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
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.message).toBe("catalog chat structured output parsing failed");
    expect(errorCalls[0]?.payload).toMatchObject({
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
        name: "Error",
        message: "Assistant structured output must be valid JSON",
      },
    });
    const serializedLogs = JSON.stringify(errorCalls);
    expect(serializedLogs).not.toContain(invalidText);
  });

  test("forwards conversation and request metadata into the chat-manager log context", async () => {
    const chatCalls: Array<{ request: unknown; options: Record<string, unknown> | undefined }> = [];
    const { logger } = createLoggerStub();
    const orchestrator = createCatalogChatOrchestrator({
      retrievalService: createRetrievalService(groundedRetrievalResult()),
      rewriteService: createRewriteService(highConfidenceRewriteAttempt()),
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
    const history = [
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
      rewriteService: createRewriteService(highConfidenceRewriteAttempt()),
      buildPrompt: (input) => {
        promptInput = input as unknown as Record<string, unknown>;
        return {
          systemPrompt: "system",
          userPrompt: "user",
          request: {
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
          },
        };
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
        history,
        allowedActions: ["none", "clarify"],
      },
      userMessage: "Burger Box",
    });

    expect(promptInput?.conversationHistory).toEqual(history);
    expect(promptInput?.allowedActions).toEqual(["none", "clarify"]);
    expect(result.assistant.action.type).toBe("none");
  });
});
