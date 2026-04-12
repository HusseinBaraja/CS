import { GEMINI_EMBEDDING_DIMENSIONS } from '@cs/ai/embeddings';
import { internal } from './_generated/api';
import { action, internalAction, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';

type RetrievalLanguage = "en" | "ar";
type EnrichedVectorSearchHit = {
  _id: Id<"embeddings">;
  _score: number;
  productId: Id<"products">;
  textContent: string;
  language: RetrievalLanguage;
};

const getCompanyLanguageKey = (
  companyId: Id<"companies">,
  language: RetrievalLanguage,
): string => `${companyId}:${language}`;

export const hydrateVectorSearchHits = internalQuery({
  args: {
    companyId: v.id("companies"),
    embeddingIds: v.array(v.id("embeddings")),
  },
  handler: async (ctx, args): Promise<Array<{
    _id: Id<"embeddings">;
    productId: Id<"products">;
    textContent: string;
    language: RetrievalLanguage;
  }>> => {
    const hits: Array<{
      _id: Id<"embeddings">;
      productId: Id<"products">;
      textContent: string;
      language: RetrievalLanguage;
    }> = [];

    for (const embeddingId of args.embeddingIds) {
      const embedding = await ctx.db.get(embeddingId);
      if (!embedding || embedding.companyId !== args.companyId) {
        continue;
      }

      if (embedding.language !== "en" && embedding.language !== "ar") {
        continue;
      }

      hits.push({
        _id: embedding._id,
        productId: embedding.productId,
        textContent: embedding.textContent,
        language: embedding.language,
      });
    }

    return hits;
  },
});

const vectorSearchByEmbeddingArgs = {
  companyId: v.id("companies"),
  language: v.union(v.literal("en"), v.literal("ar")),
  embedding: v.array(v.float64()),
  count: v.number(),
} as const;

const runVectorSearchByEmbedding: (
  ctx: {
    vectorSearch: (...args: any[]) => Promise<Array<{ _id: Id<"embeddings">; _score: number }>>;
    runQuery: (...args: any[]) => Promise<Array<{
      _id: Id<"embeddings">;
      productId: Id<"products">;
      textContent: string;
      language: RetrievalLanguage;
    }>>;
  },
  args: {
    companyId: Id<"companies">;
    language: RetrievalLanguage;
    embedding: number[];
    count: number;
  },
) => Promise<EnrichedVectorSearchHit[]> = async (ctx, args): Promise<EnrichedVectorSearchHit[]> => {
  if (args.count <= 0) {
    throw new Error("count must be positive");
  }
  if (args.embedding.length !== GEMINI_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding must have ${GEMINI_EMBEDDING_DIMENSIONS} dimensions, got ${args.embedding.length}`,
    );
  }
  const results = await ctx.vectorSearch("embeddings", "by_embedding", {
    vector: args.embedding,
    limit: args.count,
    filter: (q: { eq: (field: "companyLanguage", value: string) => unknown }) =>
      q.eq(
        "companyLanguage",
        getCompanyLanguageKey(args.companyId, args.language),
      ),
  });

  const hydratedHits = await ctx.runQuery(internal.vectorSearch.hydrateVectorSearchHits, {
    companyId: args.companyId,
    embeddingIds: results.map((result) => result._id),
  });
  const scoreById = new Map(
    results.map((result) => [result._id, result._score] as const),
  );

  return hydratedHits.map((hit) => ({
    ...hit,
    _score: scoreById.get(hit._id) ?? 0,
  }));
};

export const vectorSearchByEmbedding = action({
  args: vectorSearchByEmbeddingArgs,
  handler: async (ctx, args): Promise<EnrichedVectorSearchHit[]> =>
    runVectorSearchByEmbedding(ctx, args),
});

export const vectorSearchByEmbeddingInternal = internalAction({
  args: {
    ...vectorSearchByEmbeddingArgs,
  },
  handler: async (ctx, args): Promise<EnrichedVectorSearchHit[]> =>
    runVectorSearchByEmbedding(ctx, args),
});
