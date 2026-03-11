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
  nextCursor: CleanupCursor | null;
};

export type ProductVariantCleanupCursor = {
  stage: "productVariants";
  productCursor: string | null;
  currentProductId?: Id<"products">;
  lastVariantCreationTime?: number;
};

export type MessageCleanupCursor = {
  stage: "messages";
  conversationCursor: string | null;
  currentConversationId?: Id<"conversations">;
  lastMessageCreationTime?: number;
};

export type CleanupCursor = ProductVariantCleanupCursor | MessageCleanupCursor;

const cleanupCursorValidator = v.union(
  v.object({
    stage: v.literal("productVariants"),
    productCursor: v.union(v.string(), v.null()),
    currentProductId: v.optional(v.id("products")),
    lastVariantCreationTime: v.optional(v.number()),
  }),
  v.object({
    stage: v.literal("messages"),
    conversationCursor: v.union(v.string(), v.null()),
    currentConversationId: v.optional(v.id("conversations")),
    lastMessageCreationTime: v.optional(v.number()),
  }),
);

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
  cursor: ProductVariantCleanupCursor | null,
  limit: number,
): Promise<{
  ids: Array<Id<"productVariants">>;
  nextCursor: ProductVariantCleanupCursor | null;
}> => {
  const variantIds: Array<Id<"productVariants">> = [];
  let productCursor = cursor?.productCursor ?? null;
  let currentProductId = cursor?.currentProductId;
  let lastVariantCreationTime = cursor?.lastVariantCreationTime;

  while (variantIds.length < limit) {
    if (!currentProductId) {
      const productPage = await ctx.db
        .query("products")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .paginate({
          numItems: 1,
          cursor: productCursor,
        });
      const nextProduct = productPage.page[0];
      if (!nextProduct) {
        return {
          ids: variantIds,
          nextCursor: null,
        };
      }

      currentProductId = nextProduct._id;
      productCursor = productPage.continueCursor;
      lastVariantCreationTime = undefined;
    }

    const remaining = limit - variantIds.length;
    const productId = currentProductId;
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) =>
        lastVariantCreationTime === undefined
          ? q.eq("productId", productId)
          : q.eq("productId", productId).gt("_creationTime", lastVariantCreationTime),
      )
      .take(remaining + 1);

    const hasMoreVariants = variants.length > remaining;
    const batch = hasMoreVariants ? variants.slice(0, remaining) : variants;
    variantIds.push(...batch.map((variant) => variant._id));

    if (hasMoreVariants) {
      const lastVariant = batch.at(-1);
      if (!lastVariant) {
        throw new Error("Expected a variant to establish the cleanup cursor");
      }

      return {
        ids: variantIds,
        nextCursor: {
          stage: "productVariants",
          productCursor,
          currentProductId,
          lastVariantCreationTime: lastVariant._creationTime,
        },
      };
    }

    currentProductId = undefined;
    lastVariantCreationTime = undefined;
  }

  return {
    ids: variantIds,
    nextCursor: currentProductId
      ? {
        stage: "productVariants",
        productCursor,
        currentProductId,
        lastVariantCreationTime,
      }
      : null,
  };
};

const collectMessageIdsBatch = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
  cursor: MessageCleanupCursor | null,
  limit: number,
): Promise<{
  ids: Array<Id<"messages">>;
  nextCursor: MessageCleanupCursor | null;
}> => {
  const messageIds: Array<Id<"messages">> = [];
  let conversationCursor = cursor?.conversationCursor ?? null;
  let currentConversationId = cursor?.currentConversationId;
  let lastMessageCreationTime = cursor?.lastMessageCreationTime;

  while (messageIds.length < limit) {
    if (!currentConversationId) {
      const conversationPage = await ctx.db
        .query("conversations")
        .withIndex("by_company_phone_and_muted", (q) => q.eq("companyId", companyId))
        .paginate({
          numItems: 1,
          cursor: conversationCursor,
        });
      const nextConversation = conversationPage.page[0];
      if (!nextConversation) {
        return {
          ids: messageIds,
          nextCursor: null,
        };
      }

      currentConversationId = nextConversation._id;
      conversationCursor = conversationPage.continueCursor;
      lastMessageCreationTime = undefined;
    }

    const remaining = limit - messageIds.length;
    const conversationId = currentConversationId;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        lastMessageCreationTime === undefined
          ? q.eq("conversationId", conversationId)
          : q.eq("conversationId", conversationId).gt("_creationTime", lastMessageCreationTime),
      )
      .take(remaining + 1);

    const hasMoreMessages = messages.length > remaining;
    const batch = hasMoreMessages ? messages.slice(0, remaining) : messages;
    messageIds.push(...batch.map((message) => message._id));

    if (hasMoreMessages) {
      const lastMessage = batch.at(-1);
      if (!lastMessage) {
        throw new Error("Expected a message to establish the cleanup cursor");
      }

      return {
        ids: messageIds,
        nextCursor: {
          stage: "messages",
          conversationCursor,
          currentConversationId,
          lastMessageCreationTime: lastMessage._creationTime,
        },
      };
    }

    currentConversationId = undefined;
    lastMessageCreationTime = undefined;
  }

  return {
    ids: messageIds,
    nextCursor: currentConversationId
      ? {
        stage: "messages",
        conversationCursor,
        currentConversationId,
        lastMessageCreationTime,
      }
      : null,
  };
};

const deleteBatchIfAny = async <T extends TableNames>(
  ctx: MutationCtx,
  stage: CleanupStage,
  ids: Array<Id<T>>,
  nextCursor: CleanupCursor | null = null,
): Promise<CleanupBatchResult | null> => {
  if (ids.length === 0) {
    return null;
  }

  await deleteDocuments(ctx, ids);
  return {
    deletedCount: ids.length,
    done: false,
    stage,
    nextCursor,
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
    cursor: v.optional(cleanupCursorValidator),
  },
  handler: async (ctx, args): Promise<CleanupBatchResult> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return {
        deletedCount: 0,
        done: true,
        stage: "done",
        nextCursor: null,
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

    const productVariantsBatch = await collectProductVariantIdsBatch(
      ctx,
      args.companyId,
      args.cursor?.stage === "productVariants" ? args.cursor : null,
      CLEANUP_BATCH_SIZE,
    );
    const productVariantsResult = await deleteBatchIfAny(
      ctx,
      "productVariants",
      productVariantsBatch.ids,
      productVariantsBatch.nextCursor,
    );
    if (productVariantsResult) {
      return productVariantsResult;
    }

    const messagesBatch = await collectMessageIdsBatch(
      ctx,
      args.companyId,
      args.cursor?.stage === "messages" ? args.cursor : null,
      CLEANUP_BATCH_SIZE,
    );
    const messagesResult = await deleteBatchIfAny(
      ctx,
      "messages",
      messagesBatch.ids,
      messagesBatch.nextCursor,
    );
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
      nextCursor: null,
    };
  },
});
