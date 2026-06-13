import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import { v } from 'convex/values';
import type { CleanupBatchResult, CleanupCursor } from './companyCleanup';
import { buildProductEmbeddingPayload } from './productEmbeddingRuntime';
import { SEED_SAMPLE_DATA_LOCK_HEARTBEAT_MS, SEED_SAMPLE_DATA_LOCK_POLL_MS } from './seedLock';
import type { SeedActionResult, SeedCompanySkeletonResult, SeedProductEmbeddingSnapshot } from './seedTypes';

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

export const syncSeedEmbeddings = internalAction({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<{ embeddings: number }> => {
    const products = await ctx.runQuery(internal.seedDataAccess.listSeedProductsForEmbedding, {
      companyId: args.companyId,
    });

    for (const product of products) {
      const embeddings = await buildProductEmbeddingPayload(
        {
          companyId: product.companyId,
          categoryId: product.categoryId,
          ...(product.nameEn ? { nameEn: product.nameEn } : {}),
          ...(product.nameAr ? { nameAr: product.nameAr } : {}),
          ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
          ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
          ...(product.price !== undefined ? { price: product.price } : {}),
          ...(product.currency ? { currency: product.currency } : {}),
        },
        product.units.map((unit: SeedProductEmbeddingSnapshot["units"][number]) => ({
          id: unit.id,
          productId: unit.productId,
          ...(unit.labelEn ? { labelEn: unit.labelEn } : {}),
          ...(unit.labelAr ? { labelAr: unit.labelAr } : {}),
          price: unit.price,
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
      const renewed = await ctx.runMutation(internal.seedLock.renewSeedSampleDataLock, {
        now: Date.now(),
        ownerToken,
      });

      if (!renewed.renewed) {
        throw new Error("Lost the seedSampleData lock while seeding");
      }
    };

    for (;;) {
      const acquisition = await ctx.runMutation(internal.seedLock.acquireSeedSampleDataLock, {
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
        await ctx.runQuery(internal.seedDataAccess.listSeedCompanyIds, {})
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
      const seededCompany: SeedCompanySkeletonResult = await ctx.runMutation(
        internal.seedDataAccess.upsertSeedCompanySkeleton,
        {
          ownerPhone: args.ownerPhone,
          ...(preservedCompanyId ? { companyId: preservedCompanyId } : {}),
        },
      );
      const insertedCounts = await ctx.runMutation(internal.seedDataAccess.insertSeedSampleData, {
        companyId: seededCompany.companyId,
      });
      await refreshLock();
      const syncedEmbeddings: { embeddings: number } = await runWithSeedLockHeartbeat({
        refreshLock,
        operation: () => ctx.runAction(internal.seedOrchestration.syncSeedEmbeddings, {
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
      await ctx.runMutation(internal.seedLock.releaseSeedSampleDataLock, { ownerToken });
    }
  },
});
