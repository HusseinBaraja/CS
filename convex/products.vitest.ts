/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { setGeminiClientFactoryForTests } from '../packages/ai/src/testUtils';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
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

    const allProducts = await t.query(internal.products.list, {
      companyId,
    });
    const categoryProducts = await t.query(internal.products.list, {
      companyId,
      categoryId: otherCategoryId,
    });
    const searchedProducts = await t.query(internal.products.list, {
      companyId,
      search: "PaPeR",
    });

    expect(allProducts?.map((product: { nameEn?: string }) => product.nameEn)).toEqual(["Burger Box", "Soup Cup"]);
    expect(categoryProducts?.map((product: { nameEn?: string }) => product.nameEn)).toEqual(["Soup Cup"]);
    expect(searchedProducts?.map((product: { nameEn?: string }) => product.nameEn)).toEqual(["Burger Box"]);
  });

  it("gets a product with variants nested and hides out-of-scope products", async () => {
    const t = convexTest(schema, modules);

    const {
      companyId,
      otherCompanyId,
      categoryId,
      productId,
      variantId,
      otherVariantId,
    } = await t.run(async (ctx) => {
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
        currency: "SAR",
      });

      const variantId = await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Large",
        price: 1.45,
      });
      const otherVariantId = await ctx.db.insert("productVariants", {
        companyId: otherCompanyId,
        productId,
        label: "Other Tenant",
        price: 9.99,
      });

      return {
        companyId,
        otherCompanyId,
        categoryId,
        productId,
        variantId,
        otherVariantId,
      };
    });

    const product = await t.query(internal.products.get, {
      companyId,
      productId,
    });
    const hiddenProduct = await t.query(internal.products.get, {
      companyId: otherCompanyId,
      productId,
    });

    expect(product).toEqual({
      id: productId,
      companyId,
      categoryId,
      nameEn: "Burger Box",
      currency: "SAR",
      variants: [
        {
          companyId,
          id: variantId,
          productId,
          label: "Large",
          price: 1.45,
        },
      ],
    });
    expect(product?.variants.map((variant: { id: string }) => variant.id)).not.toContain(
      otherVariantId,
    );
    expect(hiddenProduct).toBeNull();
  });

  it("lists scoped variants for a product in stable order", async () => {
    const t = convexTest(schema, modules);

    const { companyId, otherCompanyId, productId, otherVariantId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000612",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000613",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        currency: "SAR",
      });

      await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Large",
      });
      await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Family Pack",
      });
      const otherVariantId = await ctx.db.insert("productVariants", {
        companyId: otherCompanyId,
        productId,
        label: "Other Tenant",
      });

      return {
        companyId,
        otherCompanyId,
        productId,
        otherVariantId,
      };
    });

    const variants = await t.query(internal.products.listVariants, {
      companyId,
      productId,
    });
    const hiddenVariants = await t.query(internal.products.listVariants, {
      companyId: otherCompanyId,
      productId,
    });

    expect(variants?.map((variant: { label: string }) => variant.label)).toEqual([
      "Family Pack",
      "Large",
    ]);
    expect(variants?.map((variant: { id: string }) => variant.id)).not.toContain(
      otherVariantId,
    );
    expect(hiddenVariants).toBeNull();
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

    const product = await t.action(internal.products.create, {
      companyId,
      categoryId,
      nameEn: "Burger Box",
      descriptionEn: "Disposable meal box",
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

  it("refreshes company catalog language hints after product create, update, and delete", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, categoryId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000621",
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

    await t.action(internal.products.create, {
      companyId,
      categoryId,
      nameEn: "Burger Box",
      descriptionEn: "Disposable meal packaging",
    });
    const createdProductId = await t.run(async (ctx) =>
      ctx.db
        .query("products")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .first(),
    );
    const englishHints = await t.query(internal.companies.getCatalogLanguageHints, {
      companyId,
    });

    expect(englishHints).toEqual({
      primaryCatalogLanguage: "en",
      supportedLanguages: ["en"],
      preferredTermPreservation: "catalog_language",
    });

    await t.action(internal.products.update, {
      companyId,
      productId: createdProductId!._id,
      nameEn: "Box",
      nameAr: "علبة برجر",
      descriptionEn: null,
      descriptionAr: "علبة عربية طويلة للوصف مع تفاصيل إضافية عن المنتج",
    });
    const arabicHints = await t.query(internal.companies.getCatalogLanguageHints, {
      companyId,
    });

    expect(arabicHints).toEqual({
      primaryCatalogLanguage: "ar",
      supportedLanguages: ["ar", "en"],
      preferredTermPreservation: "catalog_language",
    });

    await t.mutation(internal.products.remove, {
      companyId,
      productId: createdProductId!._id,
    });
    const emptyHints = await t.query(internal.companies.getCatalogLanguageHints, {
      companyId,
    });

    expect(emptyHints).toEqual({
      primaryCatalogLanguage: "unknown",
      supportedLanguages: [],
      preferredTermPreservation: "user_language",
    });
  });

  it("refreshes company catalog language hints across multiple product pages", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Paged Tenant",
        ownerPhone: "966500000699",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });

      let removableProductId = null;
      for (let index = 0; index < 130; index += 1) {
        const nextProductId = await ctx.db.insert("products", {
          companyId,
          categoryId,
          nameEn: `Burger Box ${index}`,
        });
        if (removableProductId === null) {
          removableProductId = nextProductId;
        }
      }

      return {
        companyId,
        productId: removableProductId!,
      };
    });

    await t.mutation(internal.products.remove, {
      companyId,
      productId,
    });

    const hints = await t.query(internal.companies.getCatalogLanguageHints, {
      companyId,
    });

    expect(hints).toEqual({
      primaryCatalogLanguage: "en",
      supportedLanguages: ["en"],
      preferredTermPreservation: "catalog_language",
    });
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
        currency: "SAR",
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

    const updatedProduct = await t.action(internal.products.update, {
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
      t.action(internal.products.update, {
        companyId,
        productId,
        categoryId: foreignCategoryId,
      }),
    ).rejects.toThrow("NOT_FOUND: Category not found");
  });

  it("updates non-embedding fields without replacing embeddings", async () => {
    const t = convexTest(schema, modules);
    const originalCatalogLanguageHints = {
      primaryCatalogLanguage: "unknown" as const,
      supportedLanguages: [] as Array<"ar" | "en">,
      preferredTermPreservation: "user_language" as const,
    };

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000610",
        catalogLanguageHints: originalCatalogLanguageHints,
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        currency: "SAR",
      });

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 40 : 50),
          textContent: `${language} text`,
          language,
          companyLanguage: `${companyId}:${language}`,
        });
      }

      return {
        companyId,
        productId,
      };
    });

    const embeddingsBefore = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    const updatedProduct = await t.action(internal.products.update, {
      companyId,
      productId,
      productNo: "123",
    });
    const embeddingsAfter = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );
    expect(updatedProduct).toMatchObject({
      id: productId,
      productNo: "123",
    });
    expect(embeddingsAfter.map((embedding) => embedding._id)).toEqual(
      embeddingsBefore.map((embedding) => embedding._id),
    );
    expect(embeddingsAfter.map((embedding) => embedding.textContent)).toEqual(
      embeddingsBefore.map((embedding) => embedding.textContent),
    );
    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));
    expect(storedProduct?.companyId).toBe(companyId);
    const storedCompany = await t.run(async (ctx) => ctx.db.get(companyId));
    expect(storedCompany?.catalogLanguageHints).toEqual(originalCatalogLanguageHints);
  });

  it("rejects stale product update snapshots before patching", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId, staleRevision } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000622",
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
      const product = await ctx.db.get(productId);
      await ctx.db.patch(productId, {
        productNo: "fresh",
        version: (product!.version ?? 0) + 1,
      });

      return {
        companyId,
        productId,
        staleRevision: product!.version ?? 0,
      };
    });

    await expect(
      t.mutation(internal.products.patchProductWithEmbeddings, {
        companyId,
        productId,
        expectedRevision: staleRevision,
        productNo: "stale",
      }),
    ).rejects.toThrow("CONFLICT: Product was modified concurrently; retry the update");

    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));
    expect(storedProduct?.productNo).toBe("fresh");
  });

  it("creates a variant and replaces embeddings with variant content", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000614",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        currency: "SAR",
      });

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 80 : 81),
          textContent: `${language} text before variant`,
          language,
          companyLanguage: `${companyId}:${language}`,
        });
      }

      return {
        companyId,
        productId,
      };
    });

    const embeddingsBefore = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    const variant = await t.action(internal.products.createVariant, {
      companyId,
      productId,
      label: "Family Pack",
      price: 2.1,
    });
    const embeddingsAfter = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );
    const storedVariants = await t.run(async (ctx) =>
      ctx.db
        .query("productVariants")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(variant).toEqual({
      companyId,
      id: storedVariants[0]!._id,
      productId,
      label: "Family Pack",
      price: 2.1,
    });
    expect(storedVariants).toHaveLength(1);
    expect(embeddingsAfter).toHaveLength(2);
    expect(embeddingsAfter.map((embedding) => embedding._id)).not.toEqual(
      embeddingsBefore.map((embedding) => embedding._id),
    );
    expect(embeddingsAfter.every((embedding) => embedding.textContent.includes("Family Pack"))).toBe(
      true,
    );
  });

  it("updates a variant, clears price, and refreshes embeddings", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, productId, variantId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000615",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        currency: "SAR",
      });
      const variantId = await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Large",
        price: 1.45,
      });

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 82 : 83),
          textContent: `${language} text before update`,
          language,
          companyLanguage: `${companyId}:${language}`,
        });
      }

      return {
        companyId,
        productId,
        variantId,
      };
    });

    const updatedVariant = await t.action(internal.products.updateVariant, {
      companyId,
      productId,
      variantId,
      label: "Extra Large",
      price: null,
    });
    const storedVariant = await t.run(async (ctx) => ctx.db.get(variantId));
    const embeddings = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(updatedVariant).toEqual({
      companyId,
      id: variantId,
      productId,
      label: "Extra Large",
    });
    expect(storedVariant).toMatchObject({
      label: "Extra Large",
    });
    expect(storedVariant?.price).toBeUndefined();
    expect(embeddings.every((embedding) => embedding.textContent.includes("Extra Large"))).toBe(true);
  });

  it("updates a variant without price and preserves the existing override", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, productId, variantId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000620",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        currency: "SAR",
      });
      const variantId = await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Large",
        price: 1.45,
      });

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 86 : 87),
          textContent: `${language} text before preserved update`,
          language,
          companyLanguage: `${companyId}:${language}`,
        });
      }

      return {
        companyId,
        productId,
        variantId,
      };
    });

    const updatedVariant = await t.action(internal.products.updateVariant, {
      companyId,
      productId,
      variantId,
      label: "Extra Large",
      });
    const storedVariant = await t.run(async (ctx) => ctx.db.get(variantId));
    const embeddings = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(updatedVariant).toEqual({
      companyId,
      id: variantId,
      productId,
      label: "Extra Large",
      price: 1.45,
    });
    expect(storedVariant).toMatchObject({
      label: "Extra Large",
      price: 1.45,
    });
    expect(embeddings.every((embedding) => embedding.textContent.includes("Extra Large"))).toBe(true);
  });

  it("deletes a variant, leaves other variants intact, and refreshes embeddings", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, productId, variantId, retainedVariantId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000616",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        currency: "SAR",
      });
      const variantId = await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Large",
        });
      const retainedVariantId = await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Small",
        });

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 84 : 85),
          textContent: `${language} text before delete`,
          language,
          companyLanguage: `${companyId}:${language}`,
        });
      }

      return {
        companyId,
        productId,
        variantId,
        retainedVariantId,
      };
    });

    const deleted = await t.action(internal.products.removeVariant, {
      companyId,
      productId,
      variantId,
    });
    const remainingVariants = await t.run(async (ctx) =>
      ctx.db
        .query("productVariants")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );
    const embeddings = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(deleted).toEqual({
      productId,
      variantId,
    });
    expect(remainingVariants.map((variant) => variant._id)).toEqual([retainedVariantId]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings.every((embedding) => !embedding.textContent.includes("Large"))).toBe(true);
    expect(embeddings.every((embedding) => embedding.textContent.includes("Small"))).toBe(true);
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
        currency: "SAR",
      });

      await ctx.db.insert("productVariants", {
        companyId,
        productId,
        label: "Large",
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

    const deleted = await t.mutation(internal.products.remove, {
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
        currency: "SAR",
      });

      return {
        companyId,
        otherCompanyId,
        productId,
      };
    });

    const updatedProduct = await t.action(internal.products.update, {
      companyId: otherCompanyId,
      productId,
      nameEn: "Hidden",
    });
    const deletedProduct = await t.mutation(internal.products.remove, {
      companyId: otherCompanyId,
      productId,
    });

    expect(companyId).toBeDefined();
    expect(updatedProduct).toBeNull();
    expect(deletedProduct).toBeNull();
  });
});


