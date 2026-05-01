import {
  GEMINI_EMBEDDING_DIMENSIONS,
  generateGeminiEmbedding,
} from "@cs/ai";
import {
  convexInternal,
  createConvexAdminClient,
} from "@cs/db";
import {
  buildContextBlock,
  dedupeHitsByProduct,
  toRetrievedProductContext,
} from "./catalogRetrievalContext";
import type {
  GenerateRetrievalQueryEmbeddingInput,
  GenerateRetrievalQueryEmbeddingOptions,
  HydratedProductRecord,
  ProductRetrievalService,
  ProductRetrievalServiceOptions,
  RetrieveCatalogContextInput,
  RetrieveCatalogContextResult,
  VectorSearchHit,
} from "./catalogRetrievalTypes";

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_CONTEXT_BLOCKS = 3;
const DEFAULT_MIN_SCORE = 0.55;

export type {
  GenerateRetrievalQueryEmbeddingInput,
  GenerateRetrievalQueryEmbeddingOptions,
  ProductRetrievalService,
  ProductRetrievalServiceOptions,
  RetrieveCatalogContextInput,
  RetrieveCatalogContextResult,
  RetrievedProductCandidate,
  RetrievedProductContext,
  RetrievalReason,
  RetrievalOutcome,
} from "./catalogRetrievalTypes";

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
