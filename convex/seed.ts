import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { CleanupBatchResult, CleanupCursor } from './companyCleanup';
import {
  buildProductEmbeddingPayload,
  type ProductEmbeddingVariantAttributes,
} from './productEmbeddingRuntime';
import {
  buildSeedCompany,
  seedCategories,
  seedCompanyTemplate,
  seedCurrencyRate,
  seedOffers,
  seedProducts,
  seedVariants,
} from './seedData';

const SEED_SAMPLE_DATA_LOCK_KEY = "seedSampleData";
const SEED_SAMPLE_DATA_LOCK_LEASE_MS = 2 * 60 * 1000;
const SEED_SAMPLE_DATA_LOCK_POLL_MS = 250;
const SEED_SAMPLE_DATA_LOCK_HEARTBEAT_MS = 25 * 1000;

type SeedInsertResult = {
  companyId: Id<"companies">;
  companyName: string;
  counts: {
    categories: number;
    embeddings: number;
    currencyRates: number;
    offers: number;
    productVariants: number;
    products: number;
  };
};

type SeedProductEmbeddingSnapshot = {
  productId: Id<"products">;
  companyId: Id<"companies">;
  categoryId: Id<"categories">;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: Record<string, string | number | boolean>;
  basePrice?: number;
  baseCurrency?: string;
  variants: Array<{
    id: Id<"productVariants">;
    productId: Id<"products">;
    variantLabel: string;
    attributes: ProductEmbeddingVariantAttributes;
    priceOverride?: number;
  }>;
};

type SeedActionResult = SeedInsertResult & {
  clearedCompanies: number;
};

type LockAcquireResult = {
  acquired: boolean;
  waitMs: number;
};

type LockRenewResult = {
  renewed: boolean;
};

type SeedCompanySkeletonResult = {
  companyId: Id<"companies">;
  companyName: string;
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export const runWithSeedLockHeartbeat = async <T>({
  refreshLock,
  operation,
  heartbeatMs = SEED_SAMPLE_DATA_LOCK_HEARTBEAT_MS,
}: {
  refreshLock: () => Promise<void>;
  operation: () => Promise<T>;
  heartbeatMs?: number;
}): Promise<T> => {
  let stopped = false;
  let heartbeatError: Error | null = null;
  let stopHeartbeat!: () => void;
  const heartbeatStopSignal = new Promise<void>((resolve) => {
    stopHeartbeat = resolve;
  });

  const heartbeat = (async (): Promise<void> => {
    while (!stopped) {
      await Promise.race([sleep(heartbeatMs), heartbeatStopSignal]);
      if (stopped) {
        return;
      }

      try {
        await refreshLock();
      } catch (error) {
        heartbeatError = asError(error);
        stopped = true;
        return;
      }
    }
  })();

  let result: T | undefined;
  let operationError: unknown;

  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  } finally {
    stopped = true;
    stopHeartbeat();
    await heartbeat;
  }

  if (operationError) {
    throw operationError;
  }

  if (heartbeatError) {
    throw heartbeatError;
  }

  return result as T;
};

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

const assertSeedCompanyTarget = (
  company: Doc<"companies"> | null,
  companyId: Id<"companies">,
): void => {
  if (!company) {
    throw new Error(`Seed company ${companyId} was not found`);
  }

  if (company.seedKey !== seedCompanyTemplate.seedKey) {
    throw new Error(`Company ${companyId} is not the seeded demo tenant`);
  }
};

export const listSeedCompanyIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const companyIds: Array<Id<"companies">> = [];

    for await (const company of ctx.db
      .query("companies")
      .withIndex("by_seed_key", (q) => q.eq("seedKey", seedCompanyTemplate.seedKey))) {
      companyIds.push(company._id);
    }

    return companyIds;
  },
});

export const listSeedProductsForEmbedding = internalQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<SeedProductEmbeddingSnapshot[]> => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const results = await Promise.all(
      products.map(async (product) => {
        const variants = await ctx.db
          .query("productVariants")
          .withIndex("by_product", (q) => q.eq("productId", product._id))
          .collect();

        const sortedVariants = [...variants].sort((left, right) =>
          left.variantLabel.localeCompare(right.variantLabel) || left._id.localeCompare(right._id),
        );

        return {
          productId: product._id,
          companyId: product.companyId,
          categoryId: product.categoryId,
          nameEn: product.nameEn,
          ...(product.nameAr ? { nameAr: product.nameAr } : {}),
          ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
          ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
          ...(product.specifications ? { specifications: product.specifications } : {}),
          ...(product.basePrice !== undefined ? { basePrice: product.basePrice } : {}),
          ...(product.baseCurrency ? { baseCurrency: product.baseCurrency } : {}),
          variants: sortedVariants.map((variant) => ({
            id: variant._id,
            productId: variant.productId,
            variantLabel: variant.variantLabel,
            attributes: variant.attributes,
            ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
          })),
        };
      }),
    );

    return results.sort((left, right) =>
      left.nameEn.localeCompare(right.nameEn) || left.productId.localeCompare(right.productId),
    );
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
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<Omit<SeedInsertResult, "companyName" | "companyId">["counts"]> => {
    assertSeedCompanyTarget(await ctx.db.get(args.companyId), args.companyId);

    const categoryIds = new Map<string, Id<"categories">>();
    for (const category of seedCategories) {
      if (categoryIds.has(category.key)) {
        throw new Error(`Duplicate category seed key: ${category.key}`);
      }

      const categoryId = await ctx.db.insert("categories", {
        companyId: args.companyId,
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
        companyId: args.companyId,
        categoryId,
        nameEn: product.nameEn,
        nameAr: product.nameAr,
        descriptionEn: product.descriptionEn,
        descriptionAr: product.descriptionAr,
        specifications: product.specifications,
        basePrice: product.basePrice,
        baseCurrency: product.baseCurrency,
        images: [],
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
        companyId: args.companyId,
        contentEn: offer.contentEn,
        contentAr: offer.contentAr,
        active: true,
        startDate: now,
        endDate: now + offer.durationDays * 24 * 60 * 60 * 1000,
      });
    }

    await ctx.db.insert("currencyRates", {
      companyId: args.companyId,
      fromCurrency: seedCurrencyRate.fromCurrency,
      toCurrency: seedCurrencyRate.toCurrency,
      rate: seedCurrencyRate.rate,
    });

    return {
      categories: seedCategories.length,
      embeddings: 0,
      products: seedProducts.length,
      productVariants: seedVariants.length,
      offers: seedOffers.length,
      currencyRates: 1,
    };
  },
});

export const upsertSeedCompanySkeleton = internalMutation({
  args: {
    ownerPhone: v.string(),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<SeedCompanySkeletonResult> => {
    const seedCompany = buildSeedCompany(args.ownerPhone);
    if (args.companyId) {
      assertSeedCompanyTarget(await ctx.db.get(args.companyId), args.companyId);

      await ctx.db.patch(args.companyId, {
        name: seedCompany.name,
        ownerPhone: seedCompany.ownerPhone,
        seedKey: seedCompany.seedKey,
        timezone: seedCompany.timezone,
        config: seedCompany.config,
        botRuntimePairingLeaseExpiresAt: undefined,
        botRuntimePairingLeaseOwner: undefined,
        botRuntimeSessionLeaseExpiresAt: undefined,
        botRuntimeSessionLeaseOwner: undefined,
      });

      return {
        companyId: args.companyId,
        companyName: seedCompany.name,
      };
    }

    const companyId = await ctx.db.insert("companies", {
      name: seedCompany.name,
      ownerPhone: seedCompany.ownerPhone,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
      config: seedCompany.config,
    });

    return {
      companyId,
      companyName: seedCompany.name,
    };
  },
});

export const syncSeedEmbeddings = internalAction({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<{ embeddings: number }> => {
    const products = await ctx.runQuery(internal.seed.listSeedProductsForEmbedding, {
      companyId: args.companyId,
    });

    for (const product of products) {
      const embeddings = await buildProductEmbeddingPayload(
        {
          companyId: product.companyId,
          categoryId: product.categoryId,
          nameEn: product.nameEn,
          ...(product.nameAr ? { nameAr: product.nameAr } : {}),
          ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
          ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
          ...(product.specifications ? { specifications: product.specifications } : {}),
          ...(product.basePrice !== undefined ? { basePrice: product.basePrice } : {}),
          ...(product.baseCurrency ? { baseCurrency: product.baseCurrency } : {}),
        },
        product.variants.map((variant: SeedProductEmbeddingSnapshot["variants"][number]) => ({
            id: variant.id,
            productId: variant.productId,
            variantLabel: variant.variantLabel,
            attributes: variant.attributes,
            ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
          })),
      );

      await ctx.runMutation(internal.productEmbeddingRuntime.replaceProductEmbeddings, {
        companyId: product.companyId,
        productId: product.productId,
        ...embeddings,
      });
    }

    return {
      embeddings: products.length * 2,
    };
  },
});

export const seedSampleData = internalAction({
  args: {
    ownerPhone: v.string(),
  },
  handler: async (ctx, args): Promise<SeedActionResult> => {
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
      const companyIds: Array<Id<"companies">> = (
        await ctx.runQuery(internal.seed.listSeedCompanyIds, {})
      ).sort((left, right) => left.localeCompare(right));
      const preservedCompanyId = companyIds[0] ?? null;

      for (const companyId of companyIds) {
        let cleanupResult: CleanupBatchResult = {
          deletedCount: 0,
          done: false,
          stage: "done",
          nextCursor: null,
        };
        let cursor: CleanupCursor | null = null;

        while (!cleanupResult.done) {
          await refreshLock();
          cleanupResult = await ctx.runMutation(internal.companyCleanup.clearCompanyDataBatch, {
            companyId,
            deleteCompany: companyId !== preservedCompanyId,
            ...(cursor ? { cursor } : {}),
          });
          cursor = cleanupResult.nextCursor;
        }
      }

      await refreshLock();
      const seededCompany: SeedCompanySkeletonResult = await ctx.runMutation(internal.seed.upsertSeedCompanySkeleton, {
        ownerPhone: args.ownerPhone,
        ...(preservedCompanyId ? { companyId: preservedCompanyId } : {}),
      });
      const insertedCounts = await ctx.runMutation(internal.seed.insertSeedSampleData, {
        companyId: seededCompany.companyId,
      });
      await refreshLock();
      const syncedEmbeddings: { embeddings: number } = await runWithSeedLockHeartbeat({
        refreshLock,
        operation: () => ctx.runAction(internal.seed.syncSeedEmbeddings, {
          companyId: seededCompany.companyId,
        }),
      });

      return {
        companyId: seededCompany.companyId,
        companyName: seededCompany.companyName,
        counts: {
          ...insertedCounts,
          embeddings: syncedEmbeddings.embeddings,
        },
        clearedCompanies: companyIds.length,
      };
    } finally {
      await ctx.runMutation(internal.seed.releaseSeedSampleDataLock, { ownerToken });
    }
  },
});
