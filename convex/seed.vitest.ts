/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { setGeminiClientFactoryForTests } from '../packages/ai/src/testUtils';
import { internal } from './_generated/api';
import schema from './schema';
import { runWithSeedLockHeartbeat } from './seed';
import {
  buildSeedCompany,
  seedCategories,
  seedCompanyTemplate,
  seedCurrencyRate,
  seedOffers,
  seedProducts,
  seedVariants,
} from './seedData';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

const createEmbedding = (seed: number): number[] =>
  Array.from({ length: 768 }, (_, index) => seed + index / 1000);

const SEED_OWNER_PHONE = "967771408660";
const seedCompany = buildSeedCompany(SEED_OWNER_PHONE);

let resetGeminiClientFactory: (() => void) | null = null;
let originalGeminiApiKey: string | undefined;
let hasStoredGeminiApiKey = false;

afterEach(() => {
  resetGeminiClientFactory?.();
  resetGeminiClientFactory = null;
  vi.useRealTimers();
  if (hasStoredGeminiApiKey) {
    if (originalGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
  }

  originalGeminiApiKey = undefined;
  hasStoredGeminiApiKey = false;
});

const installGeminiStub = (mode: "success" | "failure" = "success") => {
  if (!hasStoredGeminiApiKey) {
    originalGeminiApiKey = process.env.GEMINI_API_KEY;
    hasStoredGeminiApiKey = true;
  }

  process.env.GEMINI_API_KEY = "test-gemini-key";
  resetGeminiClientFactory?.();
  resetGeminiClientFactory = null;
  resetGeminiClientFactory = setGeminiClientFactoryForTests(() => ({
    models: {
      embedContent: async ({ contents }) => {
        if (mode === "failure") {
          throw new Error("seed embedding generation failed");
        }

        return {
          embeddings: (contents ?? []).map((_content, index) => ({
            values: createEmbedding(index + 1),
          })),
        };
      },
    },
  }));
};

const collectCounts = async (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    const categories = await ctx.db.query("categories").collect();
    const products = await ctx.db.query("products").collect();
    const productVariants = await ctx.db.query("productVariants").collect();
    const offers = await ctx.db.query("offers").collect();
    const currencyRates = await ctx.db.query("currencyRates").collect();
    const conversations = await ctx.db.query("conversations").collect();
    const messages = await ctx.db.query("messages").collect();
    const analyticsEvents = await ctx.db.query("analyticsEvents").collect();
    const embeddings = await ctx.db.query("embeddings").collect();

    return {
      analyticsEvents,
      companies,
      categories,
      conversations,
      products,
      productVariants,
      offers,
      currencyRates,
      embeddings,
      messages,
    };
  });

const getSeededCompanies = async (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) =>
    (await ctx.db.query("companies").collect()).filter(
      (company) => company.seedKey === seedCompanyTemplate.seedKey,
    )
  );

const getSeededCompany = async (t: ReturnType<typeof convexTest>) => {
  const companies = await getSeededCompanies(t);

  if (companies.length !== 1) {
    throw new Error(
      `getSeededCompany expected exactly one seeded company from getSeededCompanies, found ${companies.length}; duplicates or missing seed data would hide reseed regressions`,
    );
  }

  return companies[0]!;
};

describe.skipIf(typeof import.meta.glob !== "function")("seedSampleData", () => {
  it("keeps refreshing the seed lock while a long embedding sync is running", async () => {
    vi.useFakeTimers();

    const refreshLock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let finishOperation: ((value: number) => void) | null = null;

    const resultPromise = runWithSeedLockHeartbeat({
      heartbeatMs: 1_000,
      refreshLock,
      operation: () =>
        new Promise<number>((resolve) => {
          finishOperation = resolve;
        }),
    });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(refreshLock).toHaveBeenCalledTimes(3);

    expect(finishOperation).not.toBeNull();
    finishOperation!(42);
    await expect(resultPromise).resolves.toBe(42);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(refreshLock).toHaveBeenCalledTimes(3);
  });

  it("does not swallow the embedding sync failure when the lock heartbeat also fails", async () => {
    vi.useFakeTimers();

    const refreshLock = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("Lost the seedSampleData lock while seeding"));
    const syncError = new Error("seed embedding generation failed");
    let rejectOperation: ((error: Error) => void) | null = null;

    const resultPromise = runWithSeedLockHeartbeat({
      heartbeatMs: 1_000,
      refreshLock,
      operation: () =>
        new Promise<never>((_resolve, reject) => {
          rejectOperation = reject;
        }),
    });

    const rejection = expect(resultPromise).rejects.toThrow("seed embedding generation failed");

    expect(rejectOperation).not.toBeNull();
    rejectOperation!(syncError);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });

  it("creates the expected bilingual demo catalog", async () => {
    const t = convexTest(schema, modules);
    installGeminiStub();

    const result = await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    const counts = await collectCounts(t);

    expect(result.companyName).toBe(seedCompany.name);
    expect(counts.companies).toHaveLength(1);
    expect(counts.categories).toHaveLength(seedCategories.length);
    expect(counts.products).toHaveLength(seedProducts.length);
    expect(counts.productVariants).toHaveLength(seedVariants.length);
    expect(counts.offers).toHaveLength(seedOffers.length);
    expect(counts.currencyRates).toHaveLength(1);
    expect(counts.embeddings).toHaveLength(seedProducts.length * 2);
    expect(result.counts.embeddings).toBe(seedProducts.length * 2);

    expect(counts.companies[0]).toMatchObject({
      name: seedCompany.name,
      ownerPhone: SEED_OWNER_PHONE,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
      config: expect.objectContaining({
        botEnabled: true,
      }),
    });

    expect(counts.categories.every((category) => category.nameAr && category.descriptionAr)).toBe(true);
    expect(counts.products.every((product) => product.nameAr && product.descriptionAr && product.currency === "SAR")).toBe(true);
    expect(counts.offers.every((offer) => offer.active && offer.contentAr)).toBe(true);
    expect(counts.currencyRates[0]).toMatchObject(seedCurrencyRate);

    const productIds = new Set(counts.products.map((product) => product._id));
    expect(counts.productVariants.every((variant) => productIds.has(variant.productId))).toBe(true);
    expect(counts.embeddings.every((embedding) => counts.companies[0]?._id === embedding.companyId)).toBe(true);
    expect(new Set(counts.embeddings.map((embedding) => embedding.language))).toEqual(new Set(["ar", "en"]));
    expect(
      counts.products.every((product) =>
        counts.embeddings.filter((embedding) => embedding.productId === product._id).length === 2,
      ),
    ).toBe(true);
  });

  it("is idempotent when run multiple times", async () => {
    const t = convexTest(schema, modules);
    installGeminiStub();

    const firstRun = await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    const firstSeededCompany = await getSeededCompany(t);
    const secondRun = await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    const counts = await collectCounts(t);
    const secondSeededCompany = await getSeededCompany(t);

    expect(firstRun.counts).toEqual(secondRun.counts);
    expect(secondRun.clearedCompanies).toBe(1);
    expect(secondSeededCompany._id).toBe(firstSeededCompany._id);
    expect(counts.companies).toHaveLength(1);
    expect(counts.categories).toHaveLength(seedCategories.length);
    expect(counts.products).toHaveLength(seedProducts.length);
    expect(counts.productVariants).toHaveLength(seedVariants.length);
    expect(counts.offers).toHaveLength(seedOffers.length);
    expect(counts.currencyRates).toHaveLength(1);
    expect(counts.embeddings).toHaveLength(seedProducts.length * 2);
  });

  it("resets seeded company metadata back to the template while preserving the company id", async () => {
    const t = convexTest(schema, modules);
    installGeminiStub();

    await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });

    const seededCompany = await getSeededCompany(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(seededCompany._id, {
        name: "Edited Demo Tenant",
        ownerPhone: "967700000000",
        timezone: "Asia/Riyadh",
        config: {
          botEnabled: false,
          welcomesEnabled: false,
        },
        botRuntimePairingLeaseExpiresAt: 123_456,
        botRuntimePairingLeaseOwner: "pairing-owner",
        botRuntimeSessionLeaseExpiresAt: 654_321,
        botRuntimeSessionLeaseOwner: "session-owner",
      });
    });

    await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });

    const reseededCompany = await getSeededCompany(t);

    expect(reseededCompany._id).toBe(seededCompany._id);
    expect(reseededCompany).toMatchObject({
      name: seedCompany.name,
      ownerPhone: SEED_OWNER_PHONE,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
      config: seedCompany.config,
    });
    expect(reseededCompany.botRuntimePairingLeaseExpiresAt).toBeUndefined();
    expect(reseededCompany.botRuntimePairingLeaseOwner).toBeUndefined();
    expect(reseededCompany.botRuntimeSessionLeaseExpiresAt).toBeUndefined();
    expect(reseededCompany.botRuntimeSessionLeaseOwner).toBeUndefined();
  });

  it("rejects direct seed helper mutations for non-seed tenants", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Real Tenant",
        ownerPhone: SEED_OWNER_PHONE,
        timezone: "Asia/Riyadh",
        config: { defaultLanguage: "en" },
      })
    );

    await expect(
      t.mutation(internal.seed.insertSeedSampleData, {
        companyId,
      }),
    ).rejects.toThrow(`Company ${companyId} is not the seeded demo tenant`);

    await expect(
      t.mutation(internal.seed.upsertSeedCompanySkeleton, {
        ownerPhone: SEED_OWNER_PHONE,
        companyId,
      }),
    ).rejects.toThrow(`Company ${companyId} is not the seeded demo tenant`);
  });

  it("makes getSeededCompany fail when the seed is missing", async () => {
    const t = convexTest(schema, modules);

    await expect(getSeededCompany(t)).rejects.toThrow(
      "getSeededCompany expected exactly one seeded company from getSeededCompanies, found 0",
    );
  });

  it("makes getSeededCompany fail when duplicate seeded companies exist", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Duplicate Seed A",
        ownerPhone: "967700000101",
        seedKey: seedCompanyTemplate.seedKey,
        timezone: "Asia/Aden",
        config: {
          botEnabled: true,
        },
      });
      await ctx.db.insert("companies", {
        name: "Duplicate Seed B",
        ownerPhone: "967700000102",
        seedKey: seedCompanyTemplate.seedKey,
        timezone: "Asia/Riyadh",
        config: {
          botEnabled: false,
        },
      });
    });

    await expect(getSeededCompany(t)).rejects.toThrow(
      "getSeededCompany expected exactly one seeded company from getSeededCompanies, found 2",
    );
  });

  it("uses a single seed lock owner and releases it after completion", async () => {
    const t = convexTest(schema, modules);
    const ownerToken = "seed-lock-owner";

    const firstAcquire = await t.mutation(internal.seed.acquireSeedSampleDataLock, {
      now: 1_000,
      ownerToken,
    });
    const secondAcquire = await t.mutation(internal.seed.acquireSeedSampleDataLock, {
      now: 1_500,
      ownerToken: "another-owner",
    });
    const renewed = await t.mutation(internal.seed.renewSeedSampleDataLock, {
      now: 2_000,
      ownerToken,
    });

    expect(firstAcquire).toEqual({
      acquired: true,
      waitMs: 0,
    });
    expect(secondAcquire.acquired).toBe(false);
    expect(secondAcquire.waitMs).toBeGreaterThan(0);
    expect(renewed).toEqual({
      renewed: true,
    });

    await t.mutation(internal.seed.releaseSeedSampleDataLock, {
      ownerToken,
    });

    const lockCount = await t.run(async (ctx) => ctx.db.query("jobLocks").collect());
    expect(lockCount).toHaveLength(0);
  });

  it("allows a new owner to take over an expired seed lock", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.seed.acquireSeedSampleDataLock, {
      now: 1_000,
      ownerToken: "expired-owner",
    });

    const acquired = await t.mutation(internal.seed.acquireSeedSampleDataLock, {
      now: 200_000,
      ownerToken: "replacement-owner",
    });

    expect(acquired).toEqual({
      acquired: true,
      waitMs: 0,
    });

    const locks = await t.run(async (ctx) => ctx.db.query("jobLocks").collect());
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({
      key: "seedSampleData",
      ownerToken: "replacement-owner",
    });
  });

  it("does not clear non-seed tenants that happen to share the seed owner phone", async () => {
    const t = convexTest(schema, modules);
    installGeminiStub();

    const preservedTenant = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Real Tenant",
        ownerPhone: SEED_OWNER_PHONE,
        timezone: "Asia/Riyadh",
        config: { defaultLanguage: "en" },
      });

      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Preserved",
      });

      return { categoryId, companyId };
    });

    await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });

    const counts = await collectCounts(t);

    expect(counts.companies).toHaveLength(2);
    expect(counts.companies.some((company) => company._id === preservedTenant.companyId)).toBe(true);
    expect(counts.categories.some((category) => category._id === preservedTenant.categoryId)).toBe(true);
  });

  it("clears seeded tenant data over multiple cleanup batches before reseeding", async () => {
    const t = convexTest(schema, modules);
    const oversizedBatchCount = 70;
    installGeminiStub();

    await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });

    await t.run(async (ctx) => {
      const seededCompany = await ctx.db
        .query("companies")
        .withIndex("by_seed_key", (q) => q.eq("seedKey", seedCompanyTemplate.seedKey))
        .unique();

      if (!seededCompany) {
        throw new Error("Expected seeded company to exist");
      }

      const products = await ctx.db
        .query("products")
        .withIndex("by_company", (q) => q.eq("companyId", seededCompany._id))
        .collect();

      if (products.length === 0) {
        throw new Error("Expected seeded products to exist");
      }

      const conversationId = await ctx.db.insert("conversations", {
        companyId: seededCompany._id,
        phoneNumber: "+15550001111",
        muted: false,
      });

      const embedding = Array.from({ length: 768 }, () => 0.1);

      for (let index = 0; index < oversizedBatchCount; index += 1) {
        await ctx.db.insert("messages", {
          conversationId,
          role: "user",
          content: `seed cleanup message ${index}`,
          timestamp: index,
        });

        await ctx.db.insert("analyticsEvents", {
          companyId: seededCompany._id,
          eventType: "seed_cleanup_regression",
          timestamp: index,
          payload: { batch: index },
        });

        await ctx.db.insert("embeddings", {
          companyId: seededCompany._id,
          productId: products[0]._id,
          embedding,
          textContent: `seed cleanup embedding ${index}`,
          companyLanguage: "en",
          language: "en",
        });

        await ctx.db.insert("productVariants", {
          productId: products[0]._id,
          label: `seed cleanup variant ${index}`,
          });
      }
    });

    const result = await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    const counts = await collectCounts(t);

    expect(result.clearedCompanies).toBe(1);
    expect(counts.companies).toHaveLength(1);
    expect(counts.categories).toHaveLength(seedCategories.length);
    expect(counts.products).toHaveLength(seedProducts.length);
    expect(counts.productVariants).toHaveLength(seedVariants.length);
    expect(counts.offers).toHaveLength(seedOffers.length);
    expect(counts.currencyRates).toHaveLength(1);
    expect(counts.conversations).toHaveLength(0);
    expect(counts.messages).toHaveLength(0);
    expect(counts.analyticsEvents).toHaveLength(0);
    expect(counts.embeddings).toHaveLength(seedProducts.length * 2);
  });

  it("collapses duplicate seeded companies to the canonical preserved company", async () => {
    const t = convexTest(schema, modules);
    installGeminiStub();

    const duplicateCompanies = await t.run(async (ctx) => {
      const firstCompanyId = await ctx.db.insert("companies", {
        name: "Duplicate Seed A",
        ownerPhone: "967700000101",
        seedKey: seedCompanyTemplate.seedKey,
        timezone: "Asia/Aden",
        config: {
          botEnabled: true,
        },
      });
      const secondCompanyId = await ctx.db.insert("companies", {
        name: "Duplicate Seed B",
        ownerPhone: "967700000102",
        seedKey: seedCompanyTemplate.seedKey,
        timezone: "Asia/Riyadh",
        config: {
          botEnabled: false,
        },
      });

      return [firstCompanyId, secondCompanyId].sort((left, right) => left.localeCompare(right));
    });

    const result = await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    const seededCompanies = await getSeededCompanies(t);
    const counts = await collectCounts(t);

    expect(result.clearedCompanies).toBe(2);
    expect(seededCompanies).toHaveLength(1);
    expect(seededCompanies[0]?._id).toBe(duplicateCompanies[0]);
    expect(seededCompanies[0]).toMatchObject({
      name: seedCompany.name,
      ownerPhone: SEED_OWNER_PHONE,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
      config: seedCompany.config,
    });
    expect(counts.companies).toHaveLength(1);
    expect(counts.products).toHaveLength(seedProducts.length);
  });

  it("fails seeding when embedding sync fails and succeeds on a later retry", async () => {
    const t = convexTest(schema, modules);
    installGeminiStub("failure");

    await expect(t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    })).rejects.toThrow(
      "AI_PROVIDER_FAILED: seed embedding generation failed",
    );

    const failedSeededCompany = await getSeededCompany(t);

    installGeminiStub("success");

    const result = await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    const counts = await collectCounts(t);
    const recoveredSeededCompany = await getSeededCompany(t);

    expect(result.counts.embeddings).toBe(seedProducts.length * 2);
    expect(recoveredSeededCompany._id).toBe(failedSeededCompany._id);
    expect(counts.companies).toHaveLength(1);
    expect(counts.products).toHaveLength(seedProducts.length);
    expect(counts.embeddings).toHaveLength(seedProducts.length * 2);
  });

  it("replaces an existing Gemini stub before installing a new one", async () => {
    const t = convexTest(schema, modules);

    installGeminiStub("failure");
    installGeminiStub("success");

    const result = await t.action(internal.seed.seedSampleData, {
      ownerPhone: SEED_OWNER_PHONE,
    });
    const counts = await collectCounts(t);

    expect(result.counts.embeddings).toBe(seedProducts.length * 2);
    expect(counts.companies).toHaveLength(1);
    expect(counts.embeddings).toHaveLength(seedProducts.length * 2);
  });
});

