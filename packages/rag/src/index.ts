import {
  type AssistantActionType,
  type AssistantStructuredOutput,
  type ChatLanguage,
  type ChatProviderManager,
  type ChatResponse,
  buildGroundedChatPrompt,
  createChatProviderManager,
  detectChatLanguage,
  generateGeminiEmbedding,
  getAllowedActions,
  GEMINI_EMBEDDING_DIMENSIONS,
  type GroundingContextBlock,
  type LanguageDetectionResult,
  parseAssistantStructuredOutput,
  type PromptHistoryTurn,
  type StructuredOutputParseError,
} from '@cs/ai';
import {
  logEvent,
  serializeErrorForLog,
  summarizeTextForLog,
  type StructuredLogPayloadInput,
  toContextUsageLogPayload,
  toFallbackDecisionLogPayload,
  toRetrievalOutcomeLogPayload,
  toStructuredOutputFailureLogPayload,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import type { FallbackDecisionType, PromptHistoryDiagnostics } from '@cs/shared';
import {
  type ConvexAdminClient,
  type Id,
  convexInternal,
  createConvexAdminClient,
} from '@cs/db';

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_CONTEXT_BLOCKS = 3;
const DEFAULT_MIN_SCORE = 0.55;

type RetrievalReason = "empty_query" | "no_hits" | "below_min_score";

type RetrievalEmbeddingGenerator = (
  text: string,
  options?: {
    apiKey?: string;
    outputDimensionality?: number;
  },
) => Promise<number[]>;

type VectorSearchHit = {
  _id: Id<"embeddings">;
  _score: number;
  productId: Id<"products">;
  textContent: string;
  language: ChatLanguage;
};

type ProductVariantRecord = {
  id: string;
  productId: string;
  variantLabel: string;
  attributes: Record<string, unknown>;
  priceOverride?: number;
};

type HydratedProductRecord = {
  id: string;
  companyId: string;
  categoryId: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: Record<string, string | number | boolean>;
  basePrice?: number;
  baseCurrency?: string;
  images: Array<{
    id: string;
    key: string;
    contentType: string;
    sizeBytes: number;
    uploadedAt: number;
  }>;
  variants: ProductVariantRecord[];
};

export type { ChatLanguage, GroundingContextBlock } from '@cs/ai';
export type {
  AssistantActionType,
  AssistantStructuredOutput,
  LanguageDetectionResult,
  PromptHistoryTurn,
} from '@cs/ai';
export { getStep0BaselineCaseById, step0BaselineCases } from "./evaluation/step0BaselineCases";

export type RetrievalOutcome = "grounded" | "empty" | "low_signal";

export interface RetrieveCatalogContextInput {
  companyId: Id<"companies">;
  query: string;
  language: ChatLanguage;
  maxResults?: number;
  maxContextBlocks?: number;
  minScore?: number;
}

export interface RetrievedProductContext {
  id: string;
  categoryId: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: Record<string, string | number | boolean>;
  basePrice?: number;
  baseCurrency?: string;
  imageCount: number;
  variants: Array<{
    variantLabel: string;
    attributes: Record<string, unknown>;
    priceOverride?: number;
  }>;
}

export interface RetrievedProductCandidate {
  productId: string;
  score: number;
  matchedEmbeddingId: string;
  matchedText: string;
  language: ChatLanguage;
  contextBlock: GroundingContextBlock;
  product: RetrievedProductContext;
}

export interface RetrieveCatalogContextResult {
  outcome: RetrievalOutcome;
  reason?: RetrievalReason;
  query: string;
  language: ChatLanguage;
  topScore?: number;
  candidates: RetrievedProductCandidate[];
  contextBlocks: GroundingContextBlock[];
}

export interface GenerateRetrievalQueryEmbeddingInput {
  query: string;
  language: ChatLanguage;
  apiKey?: string;
}

export interface GenerateRetrievalQueryEmbeddingOptions {
  generateEmbedding?: RetrievalEmbeddingGenerator;
}

export interface ProductRetrievalService {
  retrieveCatalogContext(
    input: RetrieveCatalogContextInput,
  ): Promise<RetrieveCatalogContextResult>;
}

export interface ProductRetrievalServiceOptions {
  createClient?: () => ConvexAdminClient;
  generateEmbedding?: RetrievalEmbeddingGenerator;
}

export interface CatalogChatTenantContext {
  companyId: Id<"companies">;
  preferredLanguage?: ChatLanguage;
  defaultLanguage?: ChatLanguage;
}

export interface CatalogChatConversationContext {
  conversationId?: string;
  history?: PromptHistoryTurn[];
  historyDiagnostics?: PromptHistoryDiagnostics;
  allowedActions?: readonly AssistantActionType[];
}

export interface CatalogChatInput {
  tenant: CatalogChatTenantContext;
  conversation?: CatalogChatConversationContext;
  userMessage: string;
  requestId?: string;
  logger?: StructuredLogger;
  signal?: AbortSignal;
  retrieval?: {
    maxResults?: number;
    maxContextBlocks?: number;
    minScore?: number;
  };
  provider?: {
    timeoutMs?: number;
    maxRetriesPerProvider?: number;
  };
}

export type CatalogChatOutcome =
  | "provider_response"
  | "empty_query_fallback"
  | "no_hits_fallback"
  | "low_signal_fallback"
  | "provider_failure_fallback"
  | "invalid_model_output_fallback";

export interface CatalogChatResult {
  outcome: CatalogChatOutcome;
  assistant: AssistantStructuredOutput;
  language: LanguageDetectionResult;
  retrieval: RetrieveCatalogContextResult;
  provider?: Pick<ChatResponse, "provider" | "model" | "finishReason" | "usage" | "responseId">;
}

export interface CatalogChatOrchestrator {
  respond(input: CatalogChatInput): Promise<CatalogChatResult>;
}

export type CatalogChatLogger = StructuredLogger;

export interface CreateCatalogChatOrchestratorOptions {
  retrievalService?: ProductRetrievalService;
  chatManager?: ChatProviderManager;
  detectLanguage?: typeof detectChatLanguage;
  buildPrompt?: typeof buildGroundedChatPrompt;
  parseStructuredOutput?: typeof parseAssistantStructuredOutput;
  logger?: CatalogChatLogger;
}

const normalizePositiveInteger = (value: number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
};

const normalizeNonNegativeInteger = (value: number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
};

const serializeValue = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeValue(entry)).join(", ")}]`;
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${key}: ${serializeValue(entryValue)}`);
    return `{ ${entries.join(", ")} }`;
  }

  return String(value);
};

const getPreferredDescription = (
  product: Pick<RetrievedProductContext, "descriptionEn" | "descriptionAr">,
  language: ChatLanguage,
): string | undefined =>
  language === "ar"
    ? product.descriptionAr ?? product.descriptionEn
    : product.descriptionEn ?? product.descriptionAr;

const toRetrievedProductContext = (product: HydratedProductRecord): RetrievedProductContext => ({
  id: product.id,
  categoryId: product.categoryId,
  nameEn: product.nameEn,
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.specifications ? { specifications: product.specifications } : {}),
  ...(product.basePrice !== undefined ? { basePrice: product.basePrice } : {}),
  ...(product.baseCurrency ? { baseCurrency: product.baseCurrency } : {}),
  imageCount: product.images.length,
  variants: [...product.variants]
    .sort((left, right) => left.variantLabel.localeCompare(right.variantLabel) || left.id.localeCompare(right.id))
    .map((variant) => ({
      variantLabel: variant.variantLabel,
      attributes: variant.attributes,
      ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
    })),
});

const buildContextBlockBody = (
  product: RetrievedProductContext,
  language: ChatLanguage,
): string => {
  const lines: string[] = [`Name (EN): ${product.nameEn}`];

  if (product.nameAr) {
    lines.push(`Name (AR): ${product.nameAr}`);
  }

  const description = getPreferredDescription(product, language);
  if (description) {
    lines.push(`Description: ${description}`);
  }

  if (product.basePrice !== undefined) {
    lines.push(
      `Base price: ${product.basePrice}${product.baseCurrency ? ` ${product.baseCurrency}` : ""}`,
    );
  }

  if (product.specifications && Object.keys(product.specifications).length > 0) {
    lines.push("Specifications:");
    for (const [key, value] of Object.entries(product.specifications).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey)
    )) {
      lines.push(`- ${key}: ${String(value)}`);
    }
  }

  if (product.variants.length > 0) {
    lines.push("Variants:");
    for (const variant of product.variants) {
      lines.push(
        [
          `- ${variant.variantLabel}`,
          `attributes: ${serializeValue(variant.attributes)}`,
          variant.priceOverride !== undefined ? `priceOverride: ${variant.priceOverride}` : undefined,
        ]
          .filter((entry): entry is string => Boolean(entry))
          .join(" | "),
      );
    }
  }

  lines.push(`Images available: ${product.imageCount}`);
  return lines.join("\n");
};

const buildContextBlock = (
  product: RetrievedProductContext,
  language: ChatLanguage,
): GroundingContextBlock => ({
  id: product.id,
  heading: language === "ar" && product.nameAr ? product.nameAr : product.nameEn,
  body: buildContextBlockBody(product, language),
});

const dedupeHitsByProduct = (hits: VectorSearchHit[]): VectorSearchHit[] => {
  const sortedHits = hits
    .map((hit, index) => ({ hit, index }))
    .sort((left, right) => right.hit._score - left.hit._score || left.index - right.index)
    .map(({ hit }) => hit);
  const seenProductIds = new Set<string>();

  return sortedHits.filter((hit) => {
    if (seenProductIds.has(hit.productId)) {
      return false;
    }
    seenProductIds.add(hit.productId);
    return true;
  });
};

export const buildRetrievalQueryText = (
  input: Pick<GenerateRetrievalQueryEmbeddingInput, "query" | "language">,
): string => {
  const normalizedQuery = input.query.trim();
  return `language:${input.language}\nquery:${normalizedQuery}`;
};

export const generateRetrievalQueryEmbedding = async (
  input: GenerateRetrievalQueryEmbeddingInput,
  options: GenerateRetrievalQueryEmbeddingOptions = {},
): Promise<number[]> => {
  const generateEmbedding = options.generateEmbedding ?? generateGeminiEmbedding;

  return generateEmbedding(buildRetrievalQueryText(input), {
    ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
  });
};

export const createProductRetrievalService = (
  options: ProductRetrievalServiceOptions = {},
): ProductRetrievalService => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const generateEmbedding = options.generateEmbedding ?? generateGeminiEmbedding;

  return {
    retrieveCatalogContext: async (
      input: RetrieveCatalogContextInput,
    ): Promise<RetrieveCatalogContextResult> => {
      const normalizedQuery = input.query.trim();
      if (normalizedQuery.length === 0) {
        return {
          outcome: "empty",
          reason: "empty_query",
          query: normalizedQuery,
          language: input.language,
          candidates: [],
          contextBlocks: [],
        };
      }

      const client = createClient();
      const maxResults = normalizePositiveInteger(input.maxResults, DEFAULT_MAX_RESULTS);
      const maxContextBlocks = normalizeNonNegativeInteger(
        input.maxContextBlocks,
        DEFAULT_MAX_CONTEXT_BLOCKS,
      );
      const minScore = input.minScore ?? DEFAULT_MIN_SCORE;

      const embedding = await generateRetrievalQueryEmbedding(
        {
          query: normalizedQuery,
          language: input.language,
        },
        {
          generateEmbedding,
        },
      );
      const hits: VectorSearchHit[] = await client.action(convexInternal.vectorSearch.vectorSearchByEmbeddingInternal, {
        companyId: input.companyId,
        language: input.language,
        embedding,
        count: maxResults,
      });

      if (hits.length === 0) {
        return {
          outcome: "empty",
          reason: "no_hits",
          query: normalizedQuery,
          language: input.language,
          candidates: [],
          contextBlocks: [],
        };
      }

      const dedupedHits = dedupeHitsByProduct(hits);
      const hydratedProducts: HydratedProductRecord[] = await client.query(convexInternal.products.getManyForRag, {
        companyId: input.companyId,
        productIds: dedupedHits.map((hit) => hit.productId),
      });
      const productsById = new Map(hydratedProducts.map((product) => [product.id, product] as const));
      const candidates = dedupedHits.flatMap((hit) => {
        const product = productsById.get(hit.productId);
        if (!product) {
          return [];
        }

        const retrievedProduct = toRetrievedProductContext(product);
        return [{
          productId: hit.productId,
          score: hit._score,
          matchedEmbeddingId: hit._id,
          matchedText: hit.textContent,
          language: hit.language,
          contextBlock: buildContextBlock(retrievedProduct, input.language),
          product: retrievedProduct,
        }];
      });

      if (candidates.length === 0) {
        return {
          outcome: "empty",
          reason: "no_hits",
          query: normalizedQuery,
          language: input.language,
          candidates: [],
          contextBlocks: [],
        };
      }

      const topScore = candidates[0]?.score;
      if (topScore === undefined || topScore < minScore) {
        return {
          outcome: "low_signal",
          reason: "below_min_score",
          query: normalizedQuery,
          language: input.language,
          topScore,
          candidates,
          contextBlocks: [],
        };
      }

      return {
        outcome: "grounded",
        query: normalizedQuery,
        language: input.language,
        topScore,
        candidates,
        contextBlocks: candidates
          .slice(0, maxContextBlocks)
          .map((candidate) => candidate.contextBlock),
      };
    },
  };
};

const summarizeQueryForLog = (text: string) => {
  const summary = summarizeTextForLog(text);

  return {
    queryTextLength: summary.textLength,
    queryTextLineCount: summary.textLineCount,
  };
};

const summarizeProviderTextForLog = (text: string) => {
  const summary = summarizeTextForLog(text);

  return {
    providerTextLength: summary.textLength,
    providerTextLineCount: summary.textLineCount,
  };
};

const toParseFailureError = (error: StructuredOutputParseError): StructuredOutputParseError => error;

const DEFAULT_DIAGNOSTIC_CONVERSATION_ID = "unknown_conversation";
const DEFAULT_DIAGNOSTIC_REQUEST_ID = "unknown_request";

const buildRetrievalLogContext = (
  retrieval: RetrieveCatalogContextResult,
): Record<string, unknown> => ({
  outcome: retrieval.outcome,
  ...(retrieval.reason ? { reason: retrieval.reason } : {}),
  ...(retrieval.topScore !== undefined ? { topScore: retrieval.topScore } : {}),
  candidateCount: retrieval.candidates.length,
  contextBlockCount: retrieval.contextBlocks.length,
  language: retrieval.language,
});

const pickProviderMetadata = (
  response: ChatResponse,
): Pick<ChatResponse, "provider" | "model" | "finishReason" | "usage" | "responseId"> => ({
  provider: response.provider,
  model: response.model,
  finishReason: response.finishReason,
  usage: response.usage,
  responseId: response.responseId,
});

const getDiagnosticConversationId = (input: CatalogChatInput): string =>
  input.conversation?.conversationId ?? DEFAULT_DIAGNOSTIC_CONVERSATION_ID;

const getDiagnosticRequestId = (input: CatalogChatInput): string =>
  input.requestId ?? DEFAULT_DIAGNOSTIC_REQUEST_ID;

const getPromptHistorySelectionMode = (input: CatalogChatInput) =>
  input.conversation?.historyDiagnostics?.selectionMode
  ?? (input.conversation?.history?.length ? "recent_window" : "no_history");

const getRetrievalFallbackDecisionType = (
  retrieval: RetrieveCatalogContextResult,
): FallbackDecisionType | null => {
  if (retrieval.outcome === "grounded") {
    return null;
  }

  if (retrieval.reason === "empty_query") {
    return "clarify";
  }

  if (retrieval.reason === "below_min_score") {
    return "low_signal_reply";
  }

  return "no_match_reply";
};

const buildAssistantFallback = (
  responseLanguage: ChatLanguage,
  type: "empty_query" | "no_hits" | "low_signal" | "handoff",
): AssistantStructuredOutput => {
  switch (type) {
    case "empty_query":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "ما المنتج الذي تريد أن أساعِدك به؟",
          action: { type: "clarify" },
        }
        : {
          schemaVersion: "v1",
          text: "Which product can I help you with?",
          action: { type: "clarify" },
        };
    case "no_hits":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "لم أجد منتجًا مطابقًا في الكتالوج الحالي.",
          action: { type: "none" },
        }
        : {
          schemaVersion: "v1",
          text: "I couldn't find a matching product in the current catalog.",
          action: { type: "none" },
        };
    case "low_signal":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "لم أتمكن من مطابقة طلبك بثقة مع الكتالوج الحالي.",
          action: { type: "none" },
        }
        : {
          schemaVersion: "v1",
          text: "I couldn't confidently match your request to the current catalog.",
          action: { type: "none" },
        };
    case "handoff":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "لا أستطيع المساعدة بأمان الآن، لذا سأحوّلك إلى الفريق.",
          action: { type: "handoff" },
        }
        : {
          schemaVersion: "v1",
          text: "I can't help safely right now, so I'll connect you with the team.",
          action: { type: "handoff" },
        };
  }
};

const defaultCatalogChatLogger: CatalogChatLogger = {
  debug() {
    return undefined;
  },
  info() {
    return undefined;
  },
  warn() {
    return undefined;
  },
  error() {
    return undefined;
  },
};

const safeLogEvent = (
  logger: CatalogChatLogger,
  level: "info" | "warn" | "error",
  payload: StructuredLogPayloadInput,
  message: string,
): void => {
  try {
    logEvent(logger, level, payload, message);
  } catch {
    // Logging must never interfere with catalog chat fallbacks.
  }
};

export const createCatalogChatOrchestrator = (
  options: CreateCatalogChatOrchestratorOptions = {},
): CatalogChatOrchestrator => {
  const retrievalService = options.retrievalService ?? createProductRetrievalService();
  const chatManager = options.chatManager ?? createChatProviderManager();
  const detectLanguage = options.detectLanguage ?? detectChatLanguage;
  const buildPrompt = options.buildPrompt ?? buildGroundedChatPrompt;
  const parseStructuredOutput = options.parseStructuredOutput ?? parseAssistantStructuredOutput;
  const logger = options.logger ?? defaultCatalogChatLogger;

  return {
    async respond(input: CatalogChatInput): Promise<CatalogChatResult> {
      const routeLogger = withLogBindings(input.logger ?? logger, {
        runtime: "rag",
        surface: "orchestrator",
        companyId: input.tenant.companyId,
        ...(input.conversation?.conversationId
          ? { conversationId: input.conversation.conversationId }
          : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
      });
      const retrievalLogger = withLogBindings(routeLogger, {
        surface: "retrieval",
      });
      const language = detectLanguage(input.userMessage, {
        preferredLanguage: input.tenant.preferredLanguage,
        defaultLanguage: input.tenant.defaultLanguage,
      });
      const allowedActions = getAllowedActions(input.conversation?.allowedActions);
      const conversationId = getDiagnosticConversationId(input);
      const requestId = getDiagnosticRequestId(input);
      const retrieval = await retrievalService.retrieveCatalogContext({
        companyId: input.tenant.companyId,
        query: input.userMessage,
        language: language.responseLanguage,
        maxResults: input.retrieval?.maxResults,
        maxContextBlocks: input.retrieval?.maxContextBlocks,
        minScore: input.retrieval?.minScore,
      });
      safeLogEvent(
        retrievalLogger,
        "info",
        {
          event: "rag.retrieval.completed",
          runtime: "rag",
          surface: "retrieval",
          outcome: retrieval.outcome,
          responseLanguage: language.responseLanguage,
          retrieval: buildRetrievalLogContext(retrieval),
          ...summarizeQueryForLog(input.userMessage),
        },
        "catalog retrieval completed",
      );
      safeLogEvent(
        retrievalLogger,
        "info",
        toRetrievalOutcomeLogPayload({
          conversationId,
          requestId,
          queryText: input.userMessage,
          retrievalMode: "raw_latest_message",
          outcome: retrieval.outcome,
          candidateCount: retrieval.candidates.length,
          topScore: retrieval.topScore ?? null,
          contextBlockCount: retrieval.contextBlocks.length,
          fallbackChosen: getRetrievalFallbackDecisionType(retrieval),
        }),
        "catalog retrieval outcome recorded",
      );
      safeLogEvent(
        routeLogger,
        "info",
        toContextUsageLogPayload({
          conversationId,
          requestId,
          usedRecentTurns: retrieval.outcome === "grounded" && Boolean(input.conversation?.history?.length),
          usedConversationState: false,
          usedSummary: false,
          usedQuotedReference:
            retrieval.outcome === "grounded" && Boolean(input.conversation?.historyDiagnostics?.usedQuotedReference),
          usedGroundingFacts: retrieval.contextBlocks.length > 0,
          stage: "prompt_assembly",
          promptHistorySelectionMode: getPromptHistorySelectionMode(input),
        }),
        "catalog context usage recorded",
      );

      if (retrieval.outcome === "empty") {
        const assistant = buildAssistantFallback(
          language.responseLanguage,
          retrieval.reason === "empty_query" ? "empty_query" : "no_hits",
        );
        safeLogEvent(
          routeLogger,
          "info",
          toFallbackDecisionLogPayload({
            conversationId,
            requestId,
            decisionType: retrieval.reason === "empty_query" ? "clarify" : "no_match_reply",
            reason: retrieval.reason === "empty_query" ? "empty_query" : "no_hits",
            precedingStage: "retrieval",
            resolutionConfidence: null,
            retrievalOutcome: retrieval.outcome,
            providerOutcome: "not_requested",
          }),
          "catalog fallback decision recorded",
        );

        return {
          outcome: retrieval.reason === "empty_query" ? "empty_query_fallback" : "no_hits_fallback",
          assistant,
          language,
          retrieval,
        };
      }

      if (retrieval.outcome === "low_signal") {
        safeLogEvent(
          routeLogger,
          "info",
          toFallbackDecisionLogPayload({
            conversationId,
            requestId,
            decisionType: "low_signal_reply",
            reason: "below_min_score",
            precedingStage: "retrieval",
            resolutionConfidence: null,
            retrievalOutcome: retrieval.outcome,
            providerOutcome: "not_requested",
          }),
          "catalog fallback decision recorded",
        );
        return {
          outcome: "low_signal_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "low_signal"),
          language,
          retrieval,
        };
      }

      const prompt = buildPrompt({
        responseLanguage: language.responseLanguage,
        customerMessage: input.userMessage,
        conversationHistory: input.conversation?.history,
        groundingContext: retrieval.contextBlocks,
        allowedActions,
      });

      let providerResponse: ChatResponse;
      try {
        providerResponse = await chatManager.chat(prompt.request, {
          signal: input.signal,
          timeoutMs: input.provider?.timeoutMs,
          maxRetriesPerProvider: input.provider?.maxRetriesPerProvider,
          logger: input.logger ?? logger,
          logContext: {
            companyId: input.tenant.companyId,
            ...(input.conversation?.conversationId
              ? { conversationId: input.conversation.conversationId }
              : {}),
            ...(input.requestId ? { requestId: input.requestId } : {}),
            feature: "catalog_chat",
          },
        });
      } catch (error) {
        safeLogEvent(
          routeLogger,
          "error",
          {
            event: "rag.catalog_chat.provider_fallback",
            runtime: "rag",
            surface: "orchestrator",
            outcome: "provider_failure_fallback",
            companyId: input.tenant.companyId,
            ...(input.conversation?.conversationId
              ? { conversationId: input.conversation.conversationId }
              : {}),
            ...(input.requestId ? { requestId: input.requestId } : {}),
            responseLanguage: language.responseLanguage,
            retrieval: buildRetrievalLogContext(retrieval),
            error: serializeErrorForLog(error),
          },
          "catalog chat provider fallback selected",
        );
        safeLogEvent(
          routeLogger,
          "info",
          toFallbackDecisionLogPayload({
            conversationId,
            requestId,
            decisionType: "handoff",
            reason: "provider_failure",
            precedingStage: "assistant",
            resolutionConfidence: null,
            retrievalOutcome: retrieval.outcome,
            providerOutcome: "provider_failure",
          }),
          "catalog fallback decision recorded",
        );
        return {
          outcome: "provider_failure_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "handoff"),
          language,
          retrieval,
        };
      }

      const parsedAssistant = parseStructuredOutput(providerResponse.text, {
        allowedActions,
      });
      if (parsedAssistant.ok) {
        const assistant = parsedAssistant.value;
        if (assistant.action.type === "clarify" || assistant.action.type === "handoff") {
          safeLogEvent(
            routeLogger,
            "info",
            toFallbackDecisionLogPayload({
              conversationId,
              requestId,
              decisionType: assistant.action.type,
              reason: "assistant_action",
              precedingStage: "assistant",
              resolutionConfidence: null,
              retrievalOutcome: retrieval.outcome,
              providerOutcome: "response_received",
            }),
            "catalog fallback decision recorded",
          );
        }

        return {
          outcome: "provider_response",
          assistant,
          language,
          retrieval,
          provider: pickProviderMetadata(providerResponse),
        };
      }

      safeLogEvent(
        routeLogger,
        "error",
        toStructuredOutputFailureLogPayload({
          conversationId,
          requestId,
          provider: providerResponse.provider,
          model: providerResponse.model ?? null,
          failureKind: parsedAssistant.error.kind,
          repairAttempted: false,
          fallbackChosen: "handoff",
        }),
        "catalog structured output failure recorded",
      );
      safeLogEvent(
        routeLogger,
        "info",
        toFallbackDecisionLogPayload({
          conversationId,
          requestId,
          decisionType: "handoff",
          reason: parsedAssistant.error.kind,
          precedingStage: "assistant",
          resolutionConfidence: null,
          retrievalOutcome: retrieval.outcome,
          providerOutcome: "invalid_model_output",
        }),
        "catalog fallback decision recorded",
      );
      safeLogEvent(
        routeLogger,
        "error",
        {
          event: "rag.catalog_chat.parse_failed",
          runtime: "rag",
          surface: "orchestrator",
          outcome: "invalid_model_output_fallback",
          companyId: input.tenant.companyId,
          ...(input.conversation?.conversationId
            ? { conversationId: input.conversation.conversationId }
            : {}),
          ...(input.requestId ? { requestId: input.requestId } : {}),
          responseLanguage: language.responseLanguage,
          retrieval: buildRetrievalLogContext(retrieval),
          provider: pickProviderMetadata(providerResponse),
          ...summarizeProviderTextForLog(providerResponse.text),
          error: serializeErrorForLog(toParseFailureError(parsedAssistant.error)),
        },
        "catalog chat structured output parsing failed",
      );
      return {
        outcome: "invalid_model_output_fallback",
        assistant: buildAssistantFallback(language.responseLanguage, "handoff"),
        language,
        retrieval,
        provider: pickProviderMetadata(providerResponse),
      };
    },
  };
};
