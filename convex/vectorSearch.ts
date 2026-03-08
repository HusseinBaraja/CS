import { action } from './_generated/server';
import { v } from 'convex/values';
import { Id } from './_generated/dataModel';

const getCompanyLanguageKey = (
  companyId: Id<"companies">,
  language: string,
): string => `${companyId}:${language}`;

export const vectorSearchByEmbedding = action({
  args: {
    companyId: v.id("companies"),
    language: v.string(),
    embedding: v.array(v.float64()),
    count: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ _id: Id<"embeddings">; _score: number }>> => {
    if (args.count <= 0) {
      throw new Error("count must be positive");
    }
    if (args.embedding.length !== 768) {
      throw new Error(
        `embedding must have 768 dimensions, got ${args.embedding.length}`,
      );
    }
    const results = await ctx.vectorSearch("embeddings", "by_embedding", {
      vector: args.embedding,
      limit: args.count,
      filter: (q) =>
        q.eq(
          "companyLanguage",
          getCompanyLanguageKey(args.companyId, args.language),
        ),
    });

    return results;
  },
});
