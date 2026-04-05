import {
  type AssistantActionType,
  type AssistantStructuredOutput,
  assemblePrompt,
  type PromptAssemblyInput,
  type PromptAssemblyOutput,
  type ChatLanguage,
  type ChatProviderManager,
  type ChatResponse,
  type CatalogGroundingBundle,
  createChatProviderManager,
  detectChatLanguage,
  GEMINI_EMBEDDING_DIMENSIONS,
  generateGeminiEmbedding,
  getAllowedActions,
  type GroundingContextBlock,
  type LanguageDetectionResult,
  parseAssistantStructuredOutput,
  type PromptHistoryTurn,
  type StructuredOutputParseError,
} from '@cs/ai';
import {
  logEvent,
  serializeErrorForLog,
  type StructuredLogger,
  type StructuredLogPayloadInput,
  summarizeTextForLog,
  toCanonicalConversationStateFallbackMismatchLogPayload,
  toContextUsageLogPayload,
  toFallbackDecisionLogPayload,
  toResolutionClarificationShortCircuitLogPayload,
  toResolutionPassthroughLogPayload,
  toResolutionShadowDisagreementLogPayload,
  toResolutionSourceSelectionLogPayload,
  toRetrievalOutcomeLogPayload,
  toStructuredOutputFailureLogPayload,
  withLogBindings,
} from '@cs/core';
import type {
  AssistantSemanticRecordForResolution,
  CanonicalConversationStateDto,
  ConversationSummaryDto,
  FallbackDecisionType,
  PromptHistoryDiagnostics,
  ResolvedUserTurn,
  TurnResolutionPolicy,
  TurnResolutionQuotedReference,
} from '@cs/shared';
import { type ConvexAdminClient, convexInternal, createConvexAdminClient, type Id } from '@cs/db';
import { resolveUserTurn, type TurnResolutionShadowModelRefiner } from "./turnResolution";

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_CONTEXT_BLOCKS = 3;
const DEFAULT_MIN_SCORE = 0.55;
const DEFAULT_TURN_RESOLUTION_POLICY: TurnResolutionPolicy = {
  allowModelAssistedFallback: false,
  allowSemanticAssistantFallback: true,
  allowSummarySupport: true,
  staleContextWindowMs: 30 * 60 * 1_000,
  quotedReferenceOverridesStaleness: true,
  minimumConfidenceToProceed: "high",
  allowMediumConfidenceProceed: false,
  maxSemanticFallbackDepth: 3,
};

type RetrievalReason = "empty_query" | "no_hits" | "below_min_score" | "skipped_by_resolution";

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

export type { CatalogGroundingBundle, ChatLanguage, GroundingContextBlock } from '@cs/ai';
export type {
  AssistantActionType,
  AssistantStructuredOutput,
  LanguageDetectionResult,
  PromptHistoryTurn,
} from '@cs/ai';
export {
  resolveUserTurn,
  resolveUserTurnDeterministically,
} from "./turnResolution";
export type {
  ResolveUserTurnOptions,
  TurnResolutionShadowCandidateFamily,
  TurnResolutionShadowModelInput,
  TurnResolutionShadowModelOutput,
  TurnResolutionShadowModelRefiner,
} from "./turnResolution";
export { getStep0BaselineCaseById, step0BaselineCases } from "./evaluation/step0BaselineCases";
export {
  assertStep0BaselineCurrentExpectations,
  compareStep0BaselineCase,
  runStep0BaselineCases,
} from "./evaluation/step0BaselineRunner";

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
  recentTurns?: PromptHistoryTurn[];
  historyDiagnostics?: PromptHistoryDiagnostics;
  canonicalState?: CanonicalConversationStateDto;
  quotedReference?: TurnResolutionQuotedReference;
  semanticAssistantRecords?: AssistantSemanticRecordForResolution[];
  summary?: ConversationSummaryDto | null;
  resolutionPolicy?: TurnResolutionPolicy;
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
  | "clarification_fallback"
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
  buildPrompt?: typeof assemblePrompt;
  resolveTurn?: typeof resolveUserTurn;
  runTurnResolutionShadowModel?: TurnResolutionShadowModelRefiner;
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

const getPreferredProductName = (
  product: Pick<RetrievedProductContext, "nameEn" | "nameAr">,
  language: ChatLanguage,
): string => language === "ar" ? product.nameAr ?? product.nameEn : product.nameEn ?? product.nameAr ?? "";

const buildCatalogGroundingBundle = (
  retrieval: RetrieveCatalogContextResult,
  retrievalMode: CatalogGroundingBundle["retrievalMode"],
): CatalogGroundingBundle | null => {
  if (retrieval.outcome !== "grounded") {
    return null;
  }

  const groundedContextBlockIds = new Set(retrieval.contextBlocks.map((block) => block.id));
  const uniqueProducts = Array.from(
    new Map(
      retrieval.candidates
        .filter((candidate) => groundedContextBlockIds.has(candidate.contextBlock.id))
        .map((candidate) => [candidate.product.id, candidate.product] as const),
    ).values(),
  );
  const pricingFacts = uniqueProducts.flatMap((product) =>
    product.basePrice !== undefined
      ? [{
        entityId: product.id,
        kind: "base_price" as const,
        value: product.basePrice,
        ...(product.baseCurrency ? { currency: product.baseCurrency } : {}),
      }]
      : []
  );

  return {
    bundleId: `grounding:${retrieval.language}:${retrieval.query}`,
    retrievalMode,
    resolvedQuery: retrieval.query,
    entityRefs: uniqueProducts.map((product) => ({
      entityKind: "product" as const,
      entityId: product.id,
    })),
    contextBlocks: retrieval.contextBlocks,
    language: retrieval.language,
    retrievalConfidence: retrieval.topScore ?? null,
    products: uniqueProducts.map((product) => ({
      id: product.id,
      name: getPreferredProductName(product, retrieval.language),
    })),
    categories: [],
    variants: [],
    offers: [],
    pricingFacts,
    imageAvailability: uniqueProducts.map((product) => ({
      entityId: product.id,
      hasImages: product.imageCount > 0,
      imageCount: product.imageCount,
    })),
    omissions: [
      { kind: "categories", reason: "not_collected" },
      { kind: "variants", reason: "not_collected" },
      { kind: "offers", reason: "not_collected" },
      ...(pricingFacts.length > 0 ? [] : [{ kind: "pricing_facts" as const, reason: "not_available" as const }]),
    ],
  };
};

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

// future extention
const toParseFailureError = (error: StructuredOutputParseError): StructuredOutputParseError => error;

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

const getDiagnosticConversationId = (input: CatalogChatInput): string | undefined =>
  input.conversation?.conversationId;

const getDiagnosticRequestId = (input: CatalogChatInput): string | undefined =>
  input.requestId;

const getPromptHistorySelectionMode = (input: CatalogChatInput) =>
  input.conversation?.historyDiagnostics?.selectionMode
  ?? (input.conversation?.recentTurns?.length ? "recent_window" : "no_history");

const toPromptResolvedUserTurn = (
  resolvedTurn: ResolvedUserTurn,
): NonNullable<PromptAssemblyInput["currentUserTurn"]["resolvedTurn"]> => ({
  resolvedIntent: resolvedTurn.resolvedIntent,
  standaloneQuery: resolvedTurn.standaloneQuery,
  referencedEntities: resolvedTurn.referencedEntities,
  clarification: resolvedTurn.clarification,
  provenanceSummary: {
    selectedSources: resolvedTurn.provenance.selectedSources,
    conflictingSources: resolvedTurn.provenance.conflictingSources,
  },
  selectedResolutionSource: resolvedTurn.selectedResolutionSource,
});

const createResolutionSkippedRetrieval = (
  language: ChatLanguage,
): RetrieveCatalogContextResult => ({
  outcome: "empty",
  reason: "skipped_by_resolution",
  query: "",
  language,
  candidates: [],
  contextBlocks: [],
});

const createEmptyQueryRetrieval = (
  language: ChatLanguage,
): RetrieveCatalogContextResult => ({
  outcome: "empty",
  reason: "empty_query",
  query: "",
  language,
  candidates: [],
  contextBlocks: [],
});

const buildClarificationAssistantFromResolution = (
  resolvedTurn: ResolvedUserTurn,
): AssistantStructuredOutput => {
  const reason = resolvedTurn.clarification?.reason;
  const strategy = resolvedTurn.clarification?.suggestedPromptStrategy;

  if (resolvedTurn.language === "ar") {
    if (reason === "referenced_entity_invalid") {
      return {
        schemaVersion: "v1",
        text: "لم أعد أستطيع الاعتماد على المرجع السابق. اكتب اسم المنتج من فضلك.",
        action: { type: "clarify" },
      };
    }

    if (strategy === "ask_to_restate") {
      return {
        schemaVersion: "v1",
        text: "أعد كتابة اسم المنتج أو الطلب الذي تقصده من فضلك.",
        action: { type: "clarify" },
      };
    }

    if (strategy === "ask_for_index") {
      return {
        schemaVersion: "v1",
        text: "أي واحد تقصد؟ أرسل الرقم من فضلك.",
        action: { type: "clarify" },
      };
    }

    if (strategy === "explain_unsupported_scope") {
      return {
        schemaVersion: "v1",
        text: "أستطيع المساعدة فقط في أسئلة الكتالوج الحالية.",
        action: { type: "clarify" },
      };
    }

    return {
      schemaVersion: "v1",
      text: "أي منتج تقصد؟",
      action: { type: "clarify" },
    };
  }

  if (reason === "referenced_entity_invalid") {
    return {
      schemaVersion: "v1",
      text: "I can't rely on that earlier reference anymore. Please send the product name again.",
      action: { type: "clarify" },
    };
  }

  if (strategy === "ask_to_restate") {
    return {
      schemaVersion: "v1",
      text: "Please restate the product or request you mean.",
      action: { type: "clarify" },
    };
  }

  if (strategy === "ask_for_index") {
    return {
      schemaVersion: "v1",
      text: "Which one do you mean? Reply with the number.",
      action: { type: "clarify" },
    };
  }

  if (strategy === "explain_unsupported_scope") {
    return {
      schemaVersion: "v1",
      text: "I can only help with the current catalog.",
      action: { type: "clarify" },
    };
  }

  return {
    schemaVersion: "v1",
    text: "Which product do you mean?",
    action: { type: "clarify" },
  };
};

const buildCompatibilityClarificationAssistant = (
  language: ChatLanguage,
): AssistantStructuredOutput =>
  language === "ar"
    ? {
      schemaVersion: "v1",
      text: "اكتب اسم المنتج الذي تقصده من فضلك حتى أساعدك فيه.",
      action: { type: "clarify" },
    }
    : {
      schemaVersion: "v1",
      text: "Please send the product name you mean so I can help with that item.",
      action: { type: "clarify" },
    };

const buildPromptAssemblyInput = (
  input: CatalogChatInput,
  retrieval: RetrieveCatalogContextResult,
  retrievalMode: CatalogGroundingBundle["retrievalMode"] | null,
  resolvedTurn: ResolvedUserTurn,
  responseLanguage: ChatLanguage,
  allowedActions: readonly AssistantActionType[],
): PromptAssemblyInput => ({
  behaviorInstructions: {
    responseLanguage,
    allowedActions,
    groundingPolicy: "supplied_facts_only",
    ambiguityPolicy: "clarify_instead_of_guessing",
    handoffPolicy: "handoff_on_explicit_request_or_unsafe_help",
    offTopicPolicy: "refuse",
    stylePolicy: "concise_target_language",
    responseFormat: "assistant_structured_output_v1",
  },
  conversationSummary: input.conversation?.summary ?? null,
  conversationState: input.conversation?.canonicalState ?? null,
  recentTurns: input.conversation?.recentTurns ?? [],
  groundingBundle: retrievalMode ? buildCatalogGroundingBundle(retrieval, retrievalMode) : null,
  currentUserTurn: {
    rawText: input.userMessage,
    resolvedTurn: toPromptResolvedUserTurn(resolvedTurn),
  },
});

const getPromptLayerMetadata = (
  prompt: PromptAssemblyOutput,
  layer: PromptAssemblyOutput["layerMetadata"][number]["layer"],
) => prompt.layerMetadata.find((entry) => entry.layer === layer);

const hasRecoverableCanonicalState = (input: CatalogChatInput): boolean => {
  const canonicalState = input.conversation?.canonicalState;
  if (!canonicalState) {
    return false;
  }

  return canonicalState.currentFocus.kind !== "none" || canonicalState.heuristicHints.topCandidates.length > 0;
};

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
  const buildPrompt = options.buildPrompt ?? assemblePrompt;
  const resolveTurn = options.resolveTurn ?? resolveUserTurn;
  const runTurnResolutionShadowModel = options.runTurnResolutionShadowModel;
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
      const resolutionPolicy = input.conversation?.resolutionPolicy ?? DEFAULT_TURN_RESOLUTION_POLICY;
      const resolvedTurn = await resolveTurn({
        rawInboundText: input.userMessage,
        recentTurns: input.conversation?.recentTurns ?? [],
        canonicalState: input.conversation?.canonicalState ?? null,
        conversationSummary: input.conversation?.summary ?? null,
        resolutionPolicy,
        languageHint: language.responseLanguage,
        ...(input.conversation?.quotedReference ? { quotedReference: input.conversation.quotedReference } : {}),
        ...(input.conversation?.semanticAssistantRecords
          ? { semanticAssistantRecords: input.conversation.semanticAssistantRecords }
          : {}),
      }, runTurnResolutionShadowModel ? { runShadowModel: runTurnResolutionShadowModel } : {});
      const skippedRetrieval = createResolutionSkippedRetrieval(language.responseLanguage);

      safeLogEvent(
        routeLogger,
        "info",
        toResolutionSourceSelectionLogPayload({
          conversationId,
          requestId,
          selectedResolutionSource: resolvedTurn.selectedResolutionSource,
          resolvedIntent: resolvedTurn.resolvedIntent,
          preferredRetrievalMode: resolvedTurn.preferredRetrievalMode,
          resolutionConfidence: resolvedTurn.resolutionConfidence,
          clarificationRequired: resolvedTurn.clarificationRequired,
          selectedSources: resolvedTurn.provenance.selectedSources.map((source) => source.source),
          supportingSources: resolvedTurn.provenance.supportingSources.map((source) => source.source),
          conflictingSources: resolvedTurn.provenance.conflictingSources.map((source) => source.source),
          discardedSources: resolvedTurn.provenance.discardedSources.map((source) => source.source),
        }),
        "turn resolution source selection recorded",
      );

      if (
        resolvedTurn.passthroughReason
        && (resolvedTurn.queryStatus === "resolved_passthrough" || resolvedTurn.queryStatus === "unresolved_passthrough")
      ) {
        safeLogEvent(
          routeLogger,
          "info",
          toResolutionPassthroughLogPayload({
            conversationId,
            requestId,
            selectedResolutionSource: resolvedTurn.selectedResolutionSource,
            preferredRetrievalMode: resolvedTurn.preferredRetrievalMode,
            queryStatus: resolvedTurn.queryStatus,
            passthroughReason: resolvedTurn.passthroughReason,
          }),
          "turn resolution passthrough recorded",
        );
      }

      if (resolvedTurn.shadowModelAssistedResult && !resolvedTurn.shadowModelAssistedResult.agreedWithDeterministic) {
        safeLogEvent(
          routeLogger,
          "info",
          toResolutionShadowDisagreementLogPayload({
            conversationId,
            requestId,
            deterministicSource: resolvedTurn.selectedResolutionSource,
            deterministicMode: resolvedTurn.preferredRetrievalMode,
            shadowMode: resolvedTurn.shadowModelAssistedResult.preferredRetrievalMode,
            deterministicConfidence: resolvedTurn.resolutionConfidence,
            shadowConfidence: resolvedTurn.shadowModelAssistedResult.resolutionConfidence,
          }),
          "turn resolution shadow disagreement recorded",
        );
      }

      if (input.userMessage.trim().length === 0) {
        const retrieval = createEmptyQueryRetrieval(language.responseLanguage);
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
            ...summarizeQueryForLog(retrieval.query),
          },
          "catalog retrieval completed",
        );
        safeLogEvent(
          retrievalLogger,
          "info",
          toRetrievalOutcomeLogPayload({
            conversationId,
            requestId,
            queryText: retrieval.query,
            retrievalMode: "skip_retrieval",
            outcome: retrieval.outcome,
            candidateCount: retrieval.candidates.length,
            topScore: retrieval.topScore ?? null,
            contextBlockCount: retrieval.contextBlocks.length,
            fallbackChosen: "clarify",
          }),
          "catalog retrieval outcome recorded",
        );
        safeLogEvent(
          routeLogger,
          "info",
          toContextUsageLogPayload({
            conversationId,
            requestId,
            usedRecentTurns: false,
            usedConversationState: false,
            usedSummary: false,
            usedQuotedReference: false,
            usedGroundingFacts: false,
            stage: "prompt_assembly",
            promptHistorySelectionMode: getPromptHistorySelectionMode(input),
          }),
          "catalog context usage recorded",
        );
        safeLogEvent(
          routeLogger,
          "info",
          toFallbackDecisionLogPayload({
            conversationId,
            requestId,
            decisionType: "clarify",
            reason: "empty_query",
            precedingStage: "retrieval",
            resolutionConfidence: null,
            retrievalOutcome: retrieval.outcome,
            providerOutcome: "not_requested",
          }),
          "catalog fallback decision recorded",
        );
        return {
          outcome: "empty_query_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "empty_query"),
          language,
          retrieval,
        };
      }

      if (resolvedTurn.clarificationRequired) {
        safeLogEvent(
          routeLogger,
          "info",
          toResolutionClarificationShortCircuitLogPayload({
            conversationId,
            requestId,
            selectedResolutionSource: resolvedTurn.selectedResolutionSource,
            resolutionConfidence: resolvedTurn.resolutionConfidence,
            preferredRetrievalMode: "clarification_required",
            clarificationReason: resolvedTurn.clarification?.reason ?? "missing_required_entity",
          }),
          "turn resolution clarification short-circuit recorded",
        );
        return {
          outcome: "clarification_fallback",
          assistant: buildClarificationAssistantFromResolution(resolvedTurn),
          language,
          retrieval: skippedRetrieval,
        };
      }

      let retrieval = skippedRetrieval;
      let liveRetrievalMode: CatalogGroundingBundle["retrievalMode"] | null = null;
      let retrievalQuery: string | null = null;

      switch (resolvedTurn.preferredRetrievalMode) {
        case "semantic_catalog_search":
          retrievalQuery = resolvedTurn.standaloneQuery?.trim() ?? null;
          liveRetrievalMode = "semantic_catalog_search";
          break;
        case "direct_entity_lookup":
        case "variant_lookup":
          retrievalQuery = resolvedTurn.standaloneQuery?.trim() ?? null;
          safeLogEvent(
            routeLogger,
            "info",
            {
              event: "rag.turn_resolution.compatibility_fallback",
              runtime: "rag",
              surface: "orchestrator",
              outcome: "recorded",
              ...(conversationId ? { conversationId } : {}),
              ...(requestId ? { requestId } : {}),
              preferredRetrievalMode: resolvedTurn.preferredRetrievalMode,
              hasStandaloneQuery: Boolean(retrievalQuery),
              fallback: retrievalQuery ? "semantic_catalog_search" : "clarification",
            },
            "turn resolution compatibility fallback recorded",
          );
          if (!retrievalQuery) {
            return {
              outcome: "clarification_fallback",
              assistant: buildCompatibilityClarificationAssistant(language.responseLanguage),
              language,
              retrieval,
            };
          }
          liveRetrievalMode = "semantic_catalog_search";
          break;
        case "skip_retrieval":
          break;
        case "filtered_catalog_search":
          retrievalQuery = resolvedTurn.standaloneQuery?.trim() ?? null;
          liveRetrievalMode = "semantic_catalog_search";
          break;
        case "clarification_required":
          return {
            outcome: "clarification_fallback",
            assistant: buildClarificationAssistantFromResolution(resolvedTurn),
            language,
            retrieval,
          };
      }

      if (liveRetrievalMode && retrievalQuery) {
        retrieval = await retrievalService.retrieveCatalogContext({
          companyId: input.tenant.companyId,
          query: retrievalQuery,
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
            ...summarizeQueryForLog(retrievalQuery),
          },
          "catalog retrieval completed",
        );
        safeLogEvent(
          retrievalLogger,
          "info",
          toRetrievalOutcomeLogPayload({
            conversationId,
            requestId,
            queryText: retrievalQuery,
            retrievalMode: liveRetrievalMode,
            outcome: retrieval.outcome,
            candidateCount: retrieval.candidates.length,
            topScore: retrieval.topScore ?? null,
            contextBlockCount: retrieval.contextBlocks.length,
            fallbackChosen: getRetrievalFallbackDecisionType(retrieval),
          }),
          "catalog retrieval outcome recorded",
        );
        if (retrieval.outcome !== "grounded") {
          safeLogEvent(
            routeLogger,
            "info",
            toContextUsageLogPayload({
              conversationId,
              requestId,
              usedRecentTurns: false,
              usedConversationState: false,
              usedSummary: false,
              usedQuotedReference: false,
              usedGroundingFacts: false,
              stage: "prompt_assembly",
              promptHistorySelectionMode: getPromptHistorySelectionMode(input),
            }),
            "catalog context usage recorded",
          );
        }
        if (retrieval.outcome !== "grounded" && hasRecoverableCanonicalState(input)) {
          safeLogEvent(
            routeLogger,
            "info",
            toCanonicalConversationStateFallbackMismatchLogPayload(
              {
                conversationId,
                requestId,
                retrievalOutcome: retrieval.outcome,
                freshnessStatus: input.conversation?.canonicalState?.freshness.status,
                promptHistorySelectionMode: getPromptHistorySelectionMode(input),
                authoritativeFocusKind: input.conversation?.canonicalState?.currentFocus.kind,
                authoritativeFocusSource: input.conversation?.canonicalState?.currentFocus.source,
                heuristicCandidateCount: input.conversation?.canonicalState?.heuristicHints.topCandidates.length ?? 0,
              },
              {
                runtime: "rag",
                surface: "orchestrator",
                outcome: "recorded",
              },
            ),
            "catalog canonical state fallback mismatch recorded",
          );
        }

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
      }

      const promptInput = buildPromptAssemblyInput(
        input,
        retrieval,
        liveRetrievalMode,
        resolvedTurn,
        language.responseLanguage,
        allowedActions,
      );
      const prompt = buildPrompt(promptInput);
      safeLogEvent(
        routeLogger,
        "info",
        toContextUsageLogPayload({
          conversationId,
          requestId,
          usedRecentTurns: Boolean(getPromptLayerMetadata(prompt, "recent_turns")?.itemCount),
          usedConversationState: Boolean(getPromptLayerMetadata(prompt, "conversation_state")?.present),
          usedSummary: Boolean(getPromptLayerMetadata(prompt, "conversation_summary")?.present),
          usedQuotedReference: Boolean(input.conversation?.historyDiagnostics?.usedQuotedReference),
          usedGroundingFacts: Boolean(getPromptLayerMetadata(prompt, "grounding_facts")?.itemCount),
          stage: "prompt_assembly",
          promptHistorySelectionMode: getPromptHistorySelectionMode(input),
        }),
        "catalog context usage recorded",
      );

      let providerResponse: ChatResponse;
      try {
        providerResponse = await chatManager.chat({ messages: prompt.messages }, {
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
