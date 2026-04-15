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
} from '@cs/ai';
import {
  logEvent,
  serializeErrorForLog,
  summarizeTextForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import {
  type ConvexAdminClient,
  type Id,
  convexInternal,
  createConvexAdminClient,
} from '@cs/db';
import {
  buildRetrievalQueryPlan,
  buildRetrievalRewriteInput,
  createRetrievalRewriteService,
  mergeRetrievalResults,
  type CatalogChatConversationHistorySelection,
  type RetrievalMode,
  type RetrievalQueryProvenance,
  type RetrievalRewriteAttempt,
  type RetrievalRewriteService,
} from './retrievalRewrite';
export {
  buildQuotedMessageCombinedFallbackQuery,
  buildRetrievalQueryPlan,
  buildRetrievalRewriteInput,
  createRetrievalRewriteService,
  mergeRetrievalResults,
  parseRetrievalRewriteResult,
  RETRIEVAL_REWRITE_RESULT_JSON_SCHEMA,
  type CatalogChatConversationHistorySelection,
  type MergedRetrievalCandidate,
  type MergedRetrievalResult,
  type MergeableRetrievedCandidate,
  type MergeableRetrievalResult,
  type RetrievalHistorySelectionReason,
  type RetrievalMode,
  type RetrievalPlannedQuery,
  type RetrievalQueryPlan,
  type RetrievalQueryProvenance,
  type RetrievalQuerySource,
  type RetrievalRewriteAttempt,
  type RetrievalRewriteConfidence,
  type RetrievalRewriteFailureReason,
  type RetrievalRewriteInput,
  type RetrievalRewriteResult,
  type RetrievalRewriteService,
  type RetrievalRewriteStrategy,
  type RetrievalRewriteUnresolvedReason,
} from './retrievalRewrite';

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
  queryProvenance?: RetrievalQueryProvenance[];
}

export interface RetrieveCatalogContextResult {
  outcome: RetrievalOutcome;
  reason?: RetrievalReason;
  query: string;
  language: ChatLanguage;
  topScore?: number;
  candidates: RetrievedProductCandidate[];
  contextBlocks: GroundingContextBlock[];
  retrievalMode?: RetrievalMode;
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
  historySelection?: CatalogChatConversationHistorySelection;
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
  retrievalMode: RetrievalMode;
  rewrite?: RetrievalRewriteAttempt;
  provider?: Pick<ChatResponse, "provider" | "model" | "finishReason" | "usage" | "responseId">;
}

export interface CatalogChatOrchestrator {
  respond(input: CatalogChatInput): Promise<CatalogChatResult>;
}

export type CatalogChatLogger = StructuredLogger;

export interface CreateCatalogChatOrchestratorOptions {
  retrievalService?: ProductRetrievalService;
  rewriteService?: RetrievalRewriteService;
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

const summarizePrimaryRetrievalQueryForLog = (text: string) => {
  const summary = summarizeTextForLog(text);

  return {
    primaryQueryTextLength: summary.textLength,
    primaryQueryTextLineCount: summary.textLineCount,
  };
};

const summarizeProviderTextForLog = (text: string) => {
  const summary = summarizeTextForLog(text);

  return {
    providerTextLength: summary.textLength,
    providerTextLineCount: summary.textLineCount,
  };
};

const buildRetrievalLogContext = (
  retrieval: RetrieveCatalogContextResult,
): Record<string, unknown> => ({
  outcome: retrieval.outcome,
  ...(retrieval.reason ? { reason: retrieval.reason } : {}),
  ...(retrieval.topScore !== undefined ? { topScore: retrieval.topScore } : {}),
  candidateCount: retrieval.candidates.length,
  contextBlockCount: retrieval.contextBlocks.length,
  language: retrieval.language,
  ...(retrieval.retrievalMode ? { retrievalMode: retrieval.retrievalMode } : {}),
});

const buildRewriteLogContext = (
  rewrite: RetrievalRewriteAttempt | undefined,
): Record<string, unknown> => {
  if (!rewrite) {
    return {
      outcome: "not_attempted",
    };
  }

  if (rewrite.status === "success") {
    return {
      outcome: "success",
      confidence: rewrite.result.confidence,
      strategy: rewrite.result.rewriteStrategy,
      aliasCount: rewrite.result.searchAliases?.length ?? 0,
      ...(rewrite.result.unresolvedReason ? { unresolvedReason: rewrite.result.unresolvedReason } : {}),
    };
  }

  return {
    outcome: "failure",
    failureReason: rewrite.failureReason,
    ...(rewrite.result
      ? {
        confidence: rewrite.result.confidence,
        strategy: rewrite.result.rewriteStrategy,
        aliasCount: rewrite.result.searchAliases?.length ?? 0,
        ...(rewrite.result.unresolvedReason ? { unresolvedReason: rewrite.result.unresolvedReason } : {}),
      }
      : {}),
  };
};

const pickProviderMetadata = (
  response: ChatResponse,
): Pick<ChatResponse, "provider" | "model" | "finishReason" | "usage" | "responseId"> => ({
  provider: response.provider,
  model: response.model,
  finishReason: response.finishReason,
  usage: response.usage,
  responseId: response.responseId,
});

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
  payload: {
    event: string;
    runtime: string;
    surface: string;
    outcome: string;
  } & Record<string, unknown>,
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
  const rewriteService = options.rewriteService ?? createRetrievalRewriteService({
    chatManager,
  });
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
      const rewriteInput = buildRetrievalRewriteInput({
        userMessage: input.userMessage,
        conversation: input.conversation,
        responseLanguageHint: language.responseLanguage,
      });
      const rewrite = await rewriteService.rewrite(rewriteInput, {
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
          feature: "catalog_retrieval_rewrite",
        },
      });
      const queryPlan = buildRetrievalQueryPlan({
        userMessage: input.userMessage,
        quotedMessage: rewriteInput.quotedMessage,
        rewriteAttempt: rewrite,
      });
      const maxContextBlocks = normalizeNonNegativeInteger(
        input.retrieval?.maxContextBlocks,
        DEFAULT_MAX_CONTEXT_BLOCKS,
      );
      const retrievalResults = await Promise.all(
        queryPlan.queries.map((queryPlanEntry) =>
          retrievalService.retrieveCatalogContext({
            companyId: input.tenant.companyId,
            query: queryPlanEntry.text,
            language: language.responseLanguage,
            maxResults: input.retrieval?.maxResults,
            maxContextBlocks: maxContextBlocks,
            minScore: input.retrieval?.minScore,
          })
        ),
      );
      const mergedRetrieval = mergeRetrievalResults({
        queryPlan,
        retrievals: retrievalResults,
        maxContextBlocks,
      });
      const { reason: mergedReason, ...mergedRetrievalWithoutReason } = mergedRetrieval;
      const retrieval: RetrieveCatalogContextResult = {
        ...mergedRetrievalWithoutReason,
        ...(mergedReason
          ? { reason: mergedReason as RetrievalReason }
          : {}),
        retrievalMode: queryPlan.mode,
      };
      safeLogEvent(
        retrievalLogger,
        "info",
        {
          event: "rag.retrieval.completed",
          runtime: "rag",
          surface: "retrieval",
          outcome: retrieval.outcome,
          responseLanguage: language.responseLanguage,
          historySelectionReason: rewriteInput.historySelectionReason,
          rewrite: buildRewriteLogContext(rewrite),
          queryCount: queryPlan.queries.length,
          retrieval: buildRetrievalLogContext(retrieval),
          ...summarizeQueryForLog(input.userMessage),
          ...summarizePrimaryRetrievalQueryForLog(queryPlan.primaryQuery),
        },
        "catalog retrieval completed",
      );

      const logCatalogChatCompletion = (outcome: CatalogChatOutcome): void => {
        safeLogEvent(
          routeLogger,
          "info",
          {
            event: "rag.catalog_chat.completed",
            runtime: "rag",
            surface: "orchestrator",
            outcome,
            responseLanguage: language.responseLanguage,
            finalResponseBranch: outcome,
            rewrite: buildRewriteLogContext(rewrite),
            retrieval: buildRetrievalLogContext(retrieval),
          },
          "catalog chat response completed",
        );
      };

      if (retrieval.outcome === "empty") {
        const assistant = buildAssistantFallback(
          language.responseLanguage,
          retrieval.reason === "empty_query" ? "empty_query" : "no_hits",
        );
        const outcome = retrieval.reason === "empty_query" ? "empty_query_fallback" : "no_hits_fallback";
        logCatalogChatCompletion(outcome);

        return {
          outcome,
          assistant,
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          rewrite,
        };
      }

      if (retrieval.outcome === "low_signal") {
        logCatalogChatCompletion("low_signal_fallback");
        return {
          outcome: "low_signal_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "low_signal"),
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          rewrite,
        };
      }

      const prompt = buildPrompt({
        responseLanguage: language.responseLanguage,
        customerMessage: input.userMessage,
        conversationHistory: input.conversation?.history,
        groundingContext: retrieval.contextBlocks,
        retrievalMode: queryPlan.mode,
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
            rewrite: buildRewriteLogContext(rewrite),
            retrieval: buildRetrievalLogContext(retrieval),
            error: serializeErrorForLog(error),
          },
          "catalog chat provider fallback selected",
        );
        logCatalogChatCompletion("provider_failure_fallback");
        return {
          outcome: "provider_failure_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "handoff"),
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          rewrite,
        };
      }

      try {
        const assistant = parseStructuredOutput(providerResponse.text, {
          allowedActions,
        });
        logCatalogChatCompletion("provider_response");

        return {
          outcome: "provider_response",
          assistant,
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          rewrite,
          provider: pickProviderMetadata(providerResponse),
        };
      } catch (error) {
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
            rewrite: buildRewriteLogContext(rewrite),
            retrieval: buildRetrievalLogContext(retrieval),
            provider: pickProviderMetadata(providerResponse),
            ...summarizeProviderTextForLog(providerResponse.text),
            error: serializeErrorForLog(error),
          },
          "catalog chat structured output parsing failed",
        );
        logCatalogChatCompletion("invalid_model_output_fallback");
        return {
          outcome: "invalid_model_output_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "handoff"),
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          rewrite,
          provider: pickProviderMetadata(providerResponse),
        };
      }
    },
  };
};
