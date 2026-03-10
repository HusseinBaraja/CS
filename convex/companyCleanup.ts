import type { Doc, Id, TableNames } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';

export const CLEANUP_BATCH_SIZE = 64;

export const CLEANUP_COUNT_KEYS = [
  "companies",
  "categories",
  "products",
  "productVariants",
  "embeddings",
  "conversations",
  "messages",
  "offers",
  "currencyRates",
  "analyticsEvents",
] as const;

export type CleanupCountKey = (typeof CLEANUP_COUNT_KEYS)[number];

export type CleanupCounts = Record<CleanupCountKey, number>;

export type CleanupStage = Exclude<CleanupCountKey, "companies"> | "companies" | "done";

export type CleanupBatchResult = {
  deletedCount: number;
  done: boolean;
  stage: CleanupStage;
};

const deleteDocuments = async <T extends TableNames>(
  ctx: MutationCtx,
  ids: Array<Id<T>>,
): Promise<void> => {
  for (const id of ids) {
    await ctx.db.delete(id);
  }
};

const takeDocumentIds = async <T extends TableNames>(
  documents: AsyncIterable<Doc<T>>,
  limit: number,
): Promise<Array<Id<T>>> => {
  const ids: Array<Id<T>> = [];

  for await (const document of documents) {
    ids.push(document._id);
    if (ids.length >= limit) {
      break;
    }
  }

  return ids;
};

const collectProductVariantIdsBatch = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
  limit: number,
): Promise<Array<Id<"productVariants">>> => {
  const variantIds: Array<Id<"productVariants">> = [];

  for await (const product of ctx.db.query("products").withIndex("by_company", (q) => q.eq("companyId", companyId))) {
    for await (const variant of ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", product._id))) {
      variantIds.push(variant._id);
      if (variantIds.length >= limit) {
        return variantIds;
      }
    }
  }

  return variantIds;
};

const collectMessageIdsBatch = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
  limit: number,
): Promise<Array<Id<"messages">>> => {
  const messageIds: Array<Id<"messages">> = [];

  for await (const conversation of ctx.db
    .query("conversations")
    .withIndex("by_company_phone_and_muted", (q) => q.eq("companyId", companyId))) {
    for await (const message of ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))) {
      messageIds.push(message._id);
      if (messageIds.length >= limit) {
        return messageIds;
      }
    }
  }

  return messageIds;
};

const deleteBatchIfAny = async <T extends TableNames>(
  ctx: MutationCtx,
  stage: CleanupStage,
  ids: Array<Id<T>>,
): Promise<CleanupBatchResult | null> => {
  if (ids.length === 0) {
    return null;
  }

  await deleteDocuments(ctx, ids);
  return {
    deletedCount: ids.length,
    done: false,
    stage,
  };
};

export const createEmptyCleanupCounts = (): CleanupCounts => ({
  companies: 0,
  categories: 0,
  products: 0,
  productVariants: 0,
  embeddings: 0,
  conversations: 0,
  messages: 0,
  offers: 0,
  currencyRates: 0,
  analyticsEvents: 0,
});

export const companyExists = internalQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const company = await ctx.db.get(args.companyId);
    return company !== null;
  },
});

export const clearCompanyDataBatch = internalMutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<CleanupBatchResult> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return {
        deletedCount: 0,
        done: true,
        stage: "done",
      };
    }

    const embeddingsBatch = await takeDocumentIds(
      ctx.db.query("embeddings").withIndex("by_company", (q) => q.eq("companyId", args.companyId)),
      CLEANUP_BATCH_SIZE,
    );
    const embeddingsResult = await deleteBatchIfAny(ctx, "embeddings", embeddingsBatch);
    if (embeddingsResult) {
      return embeddingsResult;
    }

    const productVariantsBatch = await collectProductVariantIdsBatch(ctx, args.companyId, CLEANUP_BATCH_SIZE);
    const productVariantsResult = await deleteBatchIfAny(ctx, "productVariants", productVariantsBatch);
    if (productVariantsResult) {
      return productVariantsResult;
    }

    const messagesBatch = await collectMessageIdsBatch(ctx, args.companyId, CLEANUP_BATCH_SIZE);
    const messagesResult = await deleteBatchIfAny(ctx, "messages", messagesBatch);
    if (messagesResult) {
      return messagesResult;
    }

    const analyticsEventsBatch = await takeDocumentIds(
      ctx.db.query("analyticsEvents").withIndex("by_company_type", (q) => q.eq("companyId", args.companyId)),
      CLEANUP_BATCH_SIZE,
    );
    const analyticsEventsResult = await deleteBatchIfAny(ctx, "analyticsEvents", analyticsEventsBatch);
    if (analyticsEventsResult) {
      return analyticsEventsResult;
    }

    const productsBatch = await takeDocumentIds(
      ctx.db.query("products").withIndex("by_company", (q) => q.eq("companyId", args.companyId)),
      CLEANUP_BATCH_SIZE,
    );
    const productsResult = await deleteBatchIfAny(ctx, "products", productsBatch);
    if (productsResult) {
      return productsResult;
    }

    const categoriesBatch = await takeDocumentIds(
      ctx.db.query("categories").withIndex("by_company", (q) => q.eq("companyId", args.companyId)),
      CLEANUP_BATCH_SIZE,
    );
    const categoriesResult = await deleteBatchIfAny(ctx, "categories", categoriesBatch);
    if (categoriesResult) {
      return categoriesResult;
    }

    const offersBatch = await takeDocumentIds(
      ctx.db.query("offers").withIndex("by_company_active", (q) => q.eq("companyId", args.companyId)),
      CLEANUP_BATCH_SIZE,
    );
    const offersResult = await deleteBatchIfAny(ctx, "offers", offersBatch);
    if (offersResult) {
      return offersResult;
    }

    const currencyRatesBatch = await takeDocumentIds(
      ctx.db.query("currencyRates").withIndex("by_company", (q) => q.eq("companyId", args.companyId)),
      CLEANUP_BATCH_SIZE,
    );
    const currencyRatesResult = await deleteBatchIfAny(ctx, "currencyRates", currencyRatesBatch);
    if (currencyRatesResult) {
      return currencyRatesResult;
    }

    const conversationsBatch = await takeDocumentIds(
      ctx.db.query("conversations").withIndex("by_company_phone_and_muted", (q) => q.eq("companyId", args.companyId)),
      CLEANUP_BATCH_SIZE,
    );
    const conversationsResult = await deleteBatchIfAny(ctx, "conversations", conversationsBatch);
    if (conversationsResult) {
      return conversationsResult;
    }

    await ctx.db.delete(args.companyId);

    return {
      deletedCount: 1,
      done: true,
      stage: "companies",
    };
  },
});
