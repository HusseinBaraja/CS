import { internal } from './_generated/api';
import type { Doc, Id, TableNames } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { seedCategories, seedCompany, seedCurrencyRate, seedOffers, seedProducts, seedVariants } from './seedData';

const CLEANUP_BATCH_SIZE = 64;
const SEED_SAMPLE_DATA_LOCK_KEY = "seedSampleData";
const SEED_SAMPLE_DATA_LOCK_LEASE_MS = 2 * 60 * 1000;
const SEED_SAMPLE_DATA_LOCK_POLL_MS = 250;

type CleanupStage =
  | "embeddings"
  | "productVariants"
  | "messages"
  | "analyticsEvents"
  | "products"
  | "categories"
  | "offers"
  | "currencyRates"
  | "conversations"
  | "company"
  | "done";

type CleanupBatchResult = {
  deletedCount: number;
  done: boolean;
  stage: CleanupStage;
};

type SeedInsertResult = {
  companyId: Id<"companies">;
  companyName: string;
  counts: {
    categories: number;
    currencyRates: number;
    offers: number;
    productVariants: number;
    products: number;
  };
};

type LockAcquireResult = {
  acquired: boolean;
  waitMs: number;
};

type LockRenewResult = {
  renewed: boolean;
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

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const loadSeedLock = async (
  ctx: MutationCtx,
): Promise<Doc<"jobLocks"> | null> => {
  const locks = await ctx.db
    .query("jobLocks")
    .withIndex("by_key", (q) => q.eq("key", SEED_SAMPLE_DATA_LOCK_KEY))
    .collect();

  if (locks.length > 1) {
    throw new Error(`Expected at most one ${SEED_SAMPLE_DATA_LOCK_KEY} lock, found ${locks.length}`);
  }

  return locks[0] ?? null;
};

const extendLockExpiry = async (
  ctx: MutationCtx,
  lockId: Id<"jobLocks">,
  ownerToken: string,
  now: number,
): Promise<void> => {
  await ctx.db.patch(lockId, {
    ownerToken,
    acquiredAt: now,
    expiresAt: now + SEED_SAMPLE_DATA_LOCK_LEASE_MS,
  });
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

export const listSeedCompanyIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const companyIds: Array<Id<"companies">> = [];

    for await (const company of ctx.db
      .query("companies")
      .withIndex("by_seed_key", (q) => q.eq("seedKey", seedCompany.seedKey))) {
      companyIds.push(company._id);
    }

    return companyIds;
  },
});

export const acquireSeedSampleDataLock = internalMutation({
  args: {
    now: v.number(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<LockAcquireResult> => {
    const existingLock = await loadSeedLock(ctx);

    if (!existingLock) {
      await ctx.db.insert("jobLocks", {
        key: SEED_SAMPLE_DATA_LOCK_KEY,
        ownerToken: args.ownerToken,
        acquiredAt: args.now,
        expiresAt: args.now + SEED_SAMPLE_DATA_LOCK_LEASE_MS,
      });

      return {
        acquired: true,
        waitMs: 0,
      };
    }

    if (existingLock.ownerToken === args.ownerToken || existingLock.expiresAt <= args.now) {
      await extendLockExpiry(ctx, existingLock._id, args.ownerToken, args.now);

      return {
        acquired: true,
        waitMs: 0,
      };
    }

    return {
      acquired: false,
      waitMs: Math.max(existingLock.expiresAt - args.now, SEED_SAMPLE_DATA_LOCK_POLL_MS),
    };
  },
});

export const renewSeedSampleDataLock = internalMutation({
  args: {
    now: v.number(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<LockRenewResult> => {
    const existingLock = await loadSeedLock(ctx);

    if (!existingLock || existingLock.ownerToken !== args.ownerToken) {
      return {
        renewed: false,
      };
    }

    await extendLockExpiry(ctx, existingLock._id, args.ownerToken, args.now);

    return {
      renewed: true,
    };
  },
});

export const releaseSeedSampleDataLock = internalMutation({
  args: {
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existingLock = await loadSeedLock(ctx);
    if (!existingLock || existingLock.ownerToken !== args.ownerToken) {
      return;
    }

    await ctx.db.delete(existingLock._id);
  },
});

export const clearSeededCompanyDataBatch = internalMutation({
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
      stage: "company",
    };
  },
});

export const insertSeedSampleData = internalMutation({
  args: {},
  handler: async (ctx): Promise<SeedInsertResult> => {

    const companyId = await ctx.db.insert("companies", {
      name: seedCompany.name,
      ownerPhone: seedCompany.ownerPhone,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
      config: seedCompany.config,
    });

    const categoryIds = new Map<string, Id<"categories">>();
    for (const category of seedCategories) {
      if (categoryIds.has(category.key)) {
        throw new Error(`Duplicate category seed key: ${category.key}`);
      }

      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        descriptionEn: category.descriptionEn,
        descriptionAr: category.descriptionAr,
      });
      categoryIds.set(category.key, categoryId);
    }

    const productIds = new Map<string, Id<"products">>();
    for (const product of seedProducts) {
      if (productIds.has(product.key)) {
        throw new Error(`Duplicate product seed key: ${product.key}`);
      }

      const categoryId = categoryIds.get(product.categoryKey);
      if (!categoryId) {
        throw new Error(`Missing category for product ${product.key}`);
      }

      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: product.nameEn,
        nameAr: product.nameAr,
        descriptionEn: product.descriptionEn,
        descriptionAr: product.descriptionAr,
        specifications: product.specifications,
        basePrice: product.basePrice,
        baseCurrency: product.baseCurrency,
        imageUrls: product.imageUrls,
      });
      productIds.set(product.key, productId);
    }

    for (const variant of seedVariants) {
      const productId = productIds.get(variant.productKey);
      if (!productId) {
        throw new Error(`Missing product for variant ${variant.variantLabel}`);
      }

      await ctx.db.insert("productVariants", {
        productId,
        variantLabel: variant.variantLabel,
        attributes: variant.attributes,
        priceOverride: variant.priceOverride,
      });
    }

    const now = Date.now();
    for (const offer of seedOffers) {
      await ctx.db.insert("offers", {
        companyId,
        contentEn: offer.contentEn,
        contentAr: offer.contentAr,
        active: true,
        startDate: now,
        endDate: now + offer.durationDays * 24 * 60 * 60 * 1000,
      });
    }

    await ctx.db.insert("currencyRates", {
      companyId,
      fromCurrency: seedCurrencyRate.fromCurrency,
      toCurrency: seedCurrencyRate.toCurrency,
      rate: seedCurrencyRate.rate,
    });

    return {
      companyId,
      companyName: seedCompany.name,
      counts: {
        categories: seedCategories.length,
        products: seedProducts.length,
        productVariants: seedVariants.length,
        offers: seedOffers.length,
        currencyRates: 1,
      },
    };
  },
});

export const seedSampleData = internalAction({
  args: {},
  handler: async (ctx) => {
    const ownerToken = crypto.randomUUID();

    const refreshLock = async (): Promise<void> => {
      const renewed = await ctx.runMutation(internal.seed.renewSeedSampleDataLock, {
        now: Date.now(),
        ownerToken,
      });

      if (!renewed.renewed) {
        throw new Error("Lost the seedSampleData lock while seeding");
      }
    };

    for (;;) {
      const acquisition = await ctx.runMutation(internal.seed.acquireSeedSampleDataLock, {
        now: Date.now(),
        ownerToken,
      });

      if (acquisition.acquired) {
        break;
      }

      await sleep(Math.min(acquisition.waitMs, SEED_SAMPLE_DATA_LOCK_POLL_MS));
    }

    try {
      const companyIds: Array<Id<"companies">> = await ctx.runQuery(internal.seed.listSeedCompanyIds, {});

      for (const companyId of companyIds) {
        let cleanupResult: CleanupBatchResult = {
          deletedCount: 0,
          done: false,
          stage: "done",
        };

        while (!cleanupResult.done) {
          await refreshLock();
          cleanupResult = await ctx.runMutation(internal.seed.clearSeededCompanyDataBatch, { companyId });
        }
      }

      await refreshLock();
      const seededResult: SeedInsertResult = await ctx.runMutation(internal.seed.insertSeedSampleData, {});

      return {
        ...seededResult,
        clearedCompanies: companyIds.length,
      };
    } finally {
      await ctx.runMutation(internal.seed.releaseSeedSampleDataLock, { ownerToken });
    }
  },
});
