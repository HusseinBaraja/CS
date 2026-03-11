/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { setGeminiClientFactoryForTests } from '@cs/ai';
import { api } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

const createEmbedding = (seed: number): number[] =>
  Array.from({ length: 768 }, (_, index) => seed + index / 1000);

let resetGeminiClientFactory: (() => void) | null = null;
let originalGeminiApiKey: string | undefined;
let hasStoredGeminiApiKey = false;

afterEach(() => {
  resetGeminiClientFactory?.();
  resetGeminiClientFactory = null;
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

const installGeminiStub = () => {
  if (!hasStoredGeminiApiKey) {
    originalGeminiApiKey = process.env.GEMINI_API_KEY;
    hasStoredGeminiApiKey = true;
  }

  process.env.GEMINI_API_KEY = "test-gemini-key";
  resetGeminiClientFactory = setGeminiClientFactoryForTests(() => ({
    models: {
      embedContent: async ({ contents }) => ({
        embeddings: (contents ?? []).map((_content, index) => ({
          values: createEmbedding(index + 1),
        })),
      }),
    },
  }));
};

describe.skipIf(typeof import.meta.glob !== "function")("convex products", () => {
  it("lists scoped products, filters by category, and applies case-insensitive search", async () => {
    const t = convexTest(schema, modules);

    const { companyId, otherCategoryId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000600",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000601",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const otherCategoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Cups",
      });
      const foreignCategoryId = await ctx.db.insert("categories", {
        companyId: otherCompanyId,
        nameEn: "Foreign",
      });

      await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        descriptionEn: "Paper meal packaging",
        specifications: {
          material: "paper",
        },
      });
      await ctx.db.insert("products", {
        companyId,
        categoryId: otherCategoryId,
        nameEn: "Soup Cup",
        descriptionAr: "كوب للشوربة",
      });
      await ctx.db.insert("products", {
        companyId: otherCompanyId,
        categoryId: foreignCategoryId,
        nameEn: "Ignored Product",
      });

      return {
        companyId,
        otherCategoryId,
      };
    });

    const allProducts = await t.query(api.products.list, {
      companyId,
    });
    const categoryProducts = await t.query(api.products.list, {
      companyId,
      categoryId: otherCategoryId,
    });
    const searchedProducts = await t.query(api.products.list, {
      companyId,
      search: "PaPeR",
    });

    expect(allProducts?.map((product) => product.nameEn)).toEqual(["Burger Box", "Soup Cup"]);
    expect(categoryProducts?.map((product) => product.nameEn)).toEqual(["Soup Cup"]);
    expect(searchedProducts?.map((product) => product.nameEn)).toEqual(["Burger Box"]);
  });

  it("gets a product with variants nested and hides out-of-scope products", async () => {
    const t = convexTest(schema, modules);

    const { companyId, otherCompanyId, categoryId, productId, variantId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000602",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000603",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });

      const variantId = await ctx.db.insert("productVariants", {
        productId,
        variantLabel: "Large",
        attributes: {
          size: "L",
        },
        priceOverride: 1.45,
      });

      return {
        companyId,
        otherCompanyId,
        categoryId,
        productId,
        variantId,
      };
    });

    const product = await t.query(api.products.get, {
      companyId,
      productId,
    });
    const hiddenProduct = await t.query(api.products.get, {
      companyId: otherCompanyId,
      productId,
    });

    expect(product).toEqual({
      id: productId,
      companyId,
      categoryId,
      nameEn: "Burger Box",
      variants: [
        {
          id: variantId,
          productId,
          variantLabel: "Large",
          attributes: {
            size: "L",
          },
          priceOverride: 1.45,
        },
      ],
    });
    expect(hiddenProduct).toBeNull();
  });

  it("creates a product and stores exactly two embeddings", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, categoryId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000604",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });

      return {
        companyId,
        categoryId,
      };
    });

    const product = await t.action(api.products.create, {
      companyId,
      categoryId,
      nameEn: "Burger Box",
      descriptionEn: "Disposable meal box",
      specifications: {
        material: "paper",
      },
    });
    const storedProduct = await t.run(async (ctx) =>
      ctx.db
        .query("products")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect(),
    );
    const embeddings = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", storedProduct[0]!._id))
        .collect(),
    );

    expect(product.variants).toEqual([]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings.map((embedding) => embedding.language).sort()).toEqual(["ar", "en"]);
    expect(embeddings.every((embedding) => embedding.embedding.length === 768)).toBe(true);
  });

  it("updates a product, replaces embeddings, and rejects category changes outside the company", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, nextCategoryId, foreignCategoryId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000605",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000606",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const nextCategoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Cups",
      });
      const foreignCategoryId = await ctx.db.insert("categories", {
        companyId: otherCompanyId,
        nameEn: "Foreign",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 10 : 20),
          textContent: `${language} text`,
          language,
          companyLanguage: `${companyId}:${language}`,
        });
      }

      return {
        companyId,
        nextCategoryId,
        foreignCategoryId,
        productId,
      };
    });

    const updatedProduct = await t.action(api.products.update, {
      companyId,
      productId,
      categoryId: nextCategoryId,
      nameEn: "Updated Burger Box",
      descriptionEn: "Updated description",
    });
    const embeddings = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(updatedProduct).toMatchObject({
      id: productId,
      categoryId: nextCategoryId,
      nameEn: "Updated Burger Box",
      descriptionEn: "Updated description",
    });
    expect(embeddings).toHaveLength(2);
    expect(embeddings.every((embedding) => embedding.textContent.includes("Updated"))).toBe(true);

    await expect(
      t.action(api.products.update, {
        companyId,
        productId,
        categoryId: foreignCategoryId,
      }),
    ).rejects.toThrow("NOT_FOUND: Category not found");
  });

  it("deletes a product with its variants and embeddings", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000607",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });

      await ctx.db.insert("productVariants", {
        productId,
        variantLabel: "Large",
        attributes: {
          size: "L",
        },
      });
      await ctx.db.insert("embeddings", {
        companyId,
        productId,
        embedding: createEmbedding(30),
        textContent: "en text",
        language: "en",
        companyLanguage: `${companyId}:en`,
      });

      return {
        companyId,
        productId,
      };
    });

    const deleted = await t.mutation(api.products.remove, {
      companyId,
      productId,
    });
    const counts = await t.run(async (ctx) => ({
      product: await ctx.db.get(productId),
      variants: await ctx.db.query("productVariants").collect(),
      embeddings: await ctx.db.query("embeddings").collect(),
    }));

    expect(deleted).toEqual({
      productId,
    });
    expect(counts.product).toBeNull();
    expect(counts.variants).toHaveLength(0);
    expect(counts.embeddings).toHaveLength(0);
  });

  it("returns null for out-of-scope update and delete operations", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, otherCompanyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000608",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000609",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });

      return {
        companyId,
        otherCompanyId,
        productId,
      };
    });

    const updatedProduct = await t.action(api.products.update, {
      companyId: otherCompanyId,
      productId,
      nameEn: "Hidden",
    });
    const deletedProduct = await t.mutation(api.products.remove, {
      companyId: otherCompanyId,
      productId,
    });

    expect(companyId).toBeDefined();
    expect(updatedProduct).toBeNull();
    expect(deletedProduct).toBeNull();
  });
});
