/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { processCleanupTable } from './catalogRestructureCleanupProcessors';
import { processProducts } from './catalogRestructureCleanupProducts';
import type { CleanupCounters } from './catalogRestructureCleanupShared';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

const makeCounters = (): CleanupCounters => ({
  productsUpdated: 0,
  productsDeleted: 0,
  variantsUpdated: 0,
  variantsDeleted: 0,
  categoriesUpdated: 0,
  messagesUpdated: 0,
  messagesDeleted: 0,
  legacyDeleted: 0,
  orphanDeleted: 0,
});

const makeCleanupDb = (docsByTable: Record<string, Array<Record<string, unknown>>>) => {
  const patches: Array<{ id: unknown; patch: Record<string, unknown> }> = [];
  const docsById = new Map<unknown, Record<string, unknown>>();
  for (const docs of Object.values(docsByTable)) {
    for (const doc of docs) {
      docsById.set(doc._id, doc);
    }
  }

  return {
    patches,
    db: {
      get: async (id: unknown) => docsById.get(id) ?? null,
      patch: async (id: unknown, patch: Record<string, unknown>) => {
        const doc = docsById.get(id);
        if (doc) {
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) {
              delete doc[key];
            } else {
              doc[key] = value;
            }
          }
        }
        patches.push({ id, patch });
      },
      delete: async () => {},
      query: (table: string) => ({
        order: () => ({
          take: async (limit: number) => docsByTable[table]?.slice(0, limit) ?? [],
        }),
      }),
    },
  };
};

describe.skipIf(typeof import.meta.glob !== "function")("catalog restructure cleanup", () => {
  it("normalizes a zero limit before batching", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Deleted Tenant",
        ownerPhone: "966500000810",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "Orphan Category",
      });
      await ctx.db.delete(companyId);
    });

    const result = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 0,
    });
    const categories = await t.run(async (ctx) => ctx.db.query("categories").collect());

    expect(result.orphanDeleted).toBe(1);
    expect(categories).toHaveLength(0);
  });

  it("returns continuations across one-document pages", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Deleted Tenant",
        ownerPhone: "966500000811",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "First Orphan Category",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "Second Orphan Category",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "Third Orphan Category",
      });
      await ctx.db.delete(companyId);
    });

    const firstResult = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 1,
    });
    expect(firstResult).toMatchObject({
      processed: 1,
      orphanDeleted: 1,
      nextTable: "categories",
    });

    const secondResult = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 1,
      table: firstResult.nextTable ?? undefined,
      cursor: firstResult.nextCursor ?? undefined,
    });
    const thirdResult = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 1,
      table: secondResult.nextTable ?? undefined,
      cursor: secondResult.nextCursor ?? undefined,
    });
    const categories = await t.run(async (ctx) => ctx.db.query("categories").collect());

    expect(secondResult.orphanDeleted).toBe(1);
    expect(thirdResult.orphanDeleted).toBe(1);
    expect(categories).toHaveLength(0);
  });
});

describe("catalog restructure cleanup patching", () => {
  it("does not count already-normalized products or variants as updated", async () => {
    const company = { _id: "company-1" };
    const product = {
      _id: "product-1",
      _creationTime: 1,
      companyId: company._id,
      price: 10,
      currency: "SAR",
      primaryImage: "image-1",
    };
    const variant = {
      _id: "variant-1",
      _creationTime: 2,
      companyId: company._id,
      productId: product._id,
      label: "Small",
      price: 9,
    };
    const { db, patches } = makeCleanupDb({
      companies: [company],
      products: [product],
      productVariants: [variant],
    });
    const counters = makeCounters();

    await processProducts(db, "products", 10, counters);
    await processCleanupTable(db, "productVariants", 10, counters);

    expect(patches).toHaveLength(0);
    expect(counters.productsUpdated).toBe(0);
    expect(counters.variantsUpdated).toBe(0);
  });

  it("patches products and variants only when normalized fields differ", async () => {
    const company = { _id: "company-1" };
    const product = {
      _id: "product-1",
      _creationTime: 1,
      companyId: company._id,
      basePrice: 10,
      baseCurrency: " SAR ",
      images: [{ key: " image-1 " }],
    };
    const variant = {
      _id: "variant-1",
      _creationTime: 2,
      productId: product._id,
      variantLabel: " Small ",
      priceOverride: 9,
      attributes: { size: "S" },
    };
    const { db, patches } = makeCleanupDb({
      companies: [company],
      products: [product],
      productVariants: [variant],
    });
    const counters = makeCounters();

    await processProducts(db, "products", 10, counters);
    await processCleanupTable(db, "productVariants", 10, counters);

    expect(patches).toEqual([
      {
        id: product._id,
        patch: {
          price: 10,
          currency: "SAR",
          primaryImage: "image-1",
          productId: undefined,
          basePrice: undefined,
          baseCurrency: undefined,
          specifications: undefined,
          images: undefined,
        },
      },
      {
        id: variant._id,
        patch: {
          companyId: company._id,
          label: "Small",
          price: 9,
          variantLabel: undefined,
          attributes: undefined,
          priceOverride: undefined,
        },
      },
    ]);
    expect(counters.productsUpdated).toBe(1);
    expect(counters.variantsUpdated).toBe(1);
  });
});
