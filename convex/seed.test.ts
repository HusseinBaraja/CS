/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { seedCategories, seedCompany, seedCurrencyRate, seedOffers, seedProducts, seedVariants } from './seedData';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<unknown>>);

const collectCounts = async (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    const categories = await ctx.db.query("categories").collect();
    const products = await ctx.db.query("products").collect();
    const productVariants = await ctx.db.query("productVariants").collect();
    const offers = await ctx.db.query("offers").collect();
    const currencyRates = await ctx.db.query("currencyRates").collect();

    return {
      companies,
      categories,
      products,
      productVariants,
      offers,
      currencyRates,
    };
  });

describe.skipIf(typeof import.meta.glob !== "function")("seedSampleData", () => {
  it("creates the expected bilingual demo catalog", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.seed.seedSampleData, {});
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

    const firstRun = await t.mutation(internal.seed.seedSampleData, {});
    const secondRun = await t.mutation(internal.seed.seedSampleData, {});
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

    await t.mutation(internal.seed.seedSampleData, {});
    await t.mutation(internal.seed.seedSampleData, {});

    const counts = await collectCounts(t);

    expect(counts.companies).toHaveLength(2);
    expect(counts.companies.some((company) => company._id === preservedTenant.companyId)).toBe(true);
    expect(counts.categories.some((category) => category._id === preservedTenant.categoryId)).toBe(true);
  });
});
