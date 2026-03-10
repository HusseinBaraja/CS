import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { CleanupBatchResult } from './companyCleanup';
import { seedCategories, seedCompany, seedCurrencyRate, seedOffers, seedProducts, seedVariants } from './seedData';

const SEED_SAMPLE_DATA_LOCK_KEY = "seedSampleData";
const SEED_SAMPLE_DATA_LOCK_LEASE_MS = 2 * 60 * 1000;
const SEED_SAMPLE_DATA_LOCK_POLL_MS = 250;

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
          cleanupResult = await ctx.runMutation(internal.companyCleanup.clearCompanyDataBatch, { companyId });
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
