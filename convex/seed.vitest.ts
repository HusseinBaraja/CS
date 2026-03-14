/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { seedCategories, seedCompany, seedCurrencyRate, seedOffers, seedProducts, seedVariants } from './seedData';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

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

describe.skipIf(typeof import.meta.glob !== "function")("seedSampleData", () => {
  it("creates the expected bilingual demo catalog", async () => {
    const t = convexTest(schema, modules);

    const result = await t.action(internal.seed.seedSampleData, {});
    const counts = await collectCounts(t);

    expect(result.companyName).toBe(seedCompany.name);
    expect(counts.companies).toHaveLength(1);
    expect(counts.categories).toHaveLength(seedCategories.length);
    expect(counts.products).toHaveLength(seedProducts.length);
    expect(counts.productVariants).toHaveLength(seedVariants.length);
    expect(counts.offers).toHaveLength(seedOffers.length);
    expect(counts.currencyRates).toHaveLength(1);

    expect(counts.companies[0]).toMatchObject({
      name: seedCompany.name,
      ownerPhone: seedCompany.ownerPhone,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
    });

    expect(counts.categories.every((category) => category.nameAr && category.descriptionAr)).toBe(true);
    expect(counts.products.every((product) => product.nameAr && product.descriptionAr && product.baseCurrency === "SAR")).toBe(true);
    expect(counts.offers.every((offer) => offer.active && offer.contentAr)).toBe(true);
    expect(counts.currencyRates[0]).toMatchObject(seedCurrencyRate);

    const productIds = new Set(counts.products.map((product) => product._id));
    expect(counts.productVariants.every((variant) => productIds.has(variant.productId))).toBe(true);
  });

  it("is idempotent when run multiple times", async () => {
    const t = convexTest(schema, modules);

    const firstRun = await t.action(internal.seed.seedSampleData, {});
    const secondRun = await t.action(internal.seed.seedSampleData, {});
    const counts = await collectCounts(t);

    expect(firstRun.counts).toEqual(secondRun.counts);
    expect(secondRun.clearedCompanies).toBe(1);
    expect(counts.companies).toHaveLength(1);
    expect(counts.categories).toHaveLength(seedCategories.length);
    expect(counts.products).toHaveLength(seedProducts.length);
    expect(counts.productVariants).toHaveLength(seedVariants.length);
    expect(counts.offers).toHaveLength(seedOffers.length);
    expect(counts.currencyRates).toHaveLength(1);
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

    const preservedTenant = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Real Tenant",
        ownerPhone: seedCompany.ownerPhone,
        timezone: "Asia/Riyadh",
        config: { defaultLanguage: "en" },
      });

      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Preserved",
      });

      return { categoryId, companyId };
    });

    await t.action(internal.seed.seedSampleData, {});
    await t.action(internal.seed.seedSampleData, {});

    const counts = await collectCounts(t);

    expect(counts.companies).toHaveLength(2);
    expect(counts.companies.some((company) => company._id === preservedTenant.companyId)).toBe(true);
    expect(counts.categories.some((category) => category._id === preservedTenant.categoryId)).toBe(true);
  });

  it("clears seeded tenant data over multiple cleanup batches before reseeding", async () => {
    const t = convexTest(schema, modules);
    const oversizedBatchCount = 70;

    await t.action(internal.seed.seedSampleData, {});

    await t.run(async (ctx) => {
      const seededCompany = await ctx.db
        .query("companies")
        .withIndex("by_seed_key", (q) => q.eq("seedKey", seedCompany.seedKey))
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
      }
    });

    const result = await t.action(internal.seed.seedSampleData, {});
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
    expect(counts.embeddings).toHaveLength(0);
  });
});
