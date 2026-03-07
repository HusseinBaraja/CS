import { action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const filterEmbeddings = internalQuery({
  args: {
    results: v.array(v.object({ _id: v.id("embeddings"), _score: v.number() })),
    language: v.string(),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const finalResults = [];
    for (const r of args.results) {
      const doc = await ctx.db.get(r._id);
      if (doc && doc.language === args.language) {
        finalResults.push(r);
        if (finalResults.length >= args.count) break;
      }
    }
    return finalResults;
  },
});

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
    const results = await ctx.vectorSearch("embeddings", "by_embedding", {
      vector: args.embedding,
      limit: 256,
      filter: (q) => q.eq("companyId", args.companyId),
    });

    return await ctx.runQuery(internal.vectorSearch.filterEmbeddings, {
      results,
      language: args.language,
      count: args.count,
    });
  },
});
