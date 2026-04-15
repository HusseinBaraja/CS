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

    expect(allProducts?.map((product: { nameEn: string }) => product.nameEn)).toEqual(["Burger Box", "Soup Cup"]);
    expect(categoryProducts?.map((product: { nameEn: string }) => product.nameEn)).toEqual(["Soup Cup"]);
    expect(searchedProducts?.map((product: { nameEn: string }) => product.nameEn)).toEqual(["Burger Box"]);
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
      images: [],
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

  it("lists scoped variants for a product in stable order", async () => {
    const t = convexTest(schema, modules);

    const { companyId, otherCompanyId, productId } = await t.run(async (ctx) => {
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
      });

      await ctx.db.insert("productVariants", {
        productId,
        variantLabel: "Large",
        attributes: { size: "L" },
      });
      await ctx.db.insert("productVariants", {
        productId,
        variantLabel: "Family Pack",
        attributes: { size: "XL" },
      });

      return {
        companyId,
        otherCompanyId,
        productId,
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

    expect(variants?.map((variant: { variantLabel: string }) => variant.variantLabel)).toEqual(["Family Pack", "Large"]);
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
    expect(storedProduct[0]?.revision).toBe(1);
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
    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));

    expect(updatedProduct).toMatchObject({
      id: productId,
      categoryId: nextCategoryId,
      nameEn: "Updated Burger Box",
      descriptionEn: "Updated description",
    });
    expect(storedProduct?.revision).toBe(1);
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
      basePrice: 2.5,
      baseCurrency: "SAR",
    });
    const embeddingsAfter = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );
    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));

    expect(updatedProduct).toMatchObject({
      id: productId,
      basePrice: 2.5,
      baseCurrency: "SAR",
    });
    expect(storedProduct?.revision).toBe(1);
    expect(embeddingsAfter.map((embedding) => embedding._id)).toEqual(
      embeddingsBefore.map((embedding) => embedding._id),
    );
    expect(embeddingsAfter.map((embedding) => embedding.textContent)).toEqual(
      embeddingsBefore.map((embedding) => embedding.textContent),
    );
    expect(storedProduct?.companyId).toBe(companyId);
    const storedCompany = await t.run(async (ctx) => ctx.db.get(companyId));
    expect(storedCompany?.catalogLanguageHints).toEqual(originalCatalogLanguageHints);
  });

  it("creates a variant, preserves nested attributes, and replaces embeddings with variant content", async () => {
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
        revision: 1,
        nameEn: "Burger Box",
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
      variantLabel: "Family Pack",
      attributes: {
        size: "XL",
        nested: {
          finish: ["matte", "gloss"],
          metadata: {
            recyclable: true,
            notes: null,
          },
        },
      },
      priceOverride: 2.1,
    });
    const embeddingsAfter = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );
    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));
    const storedVariants = await t.run(async (ctx) =>
      ctx.db
        .query("productVariants")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(variant).toEqual({
      id: storedVariants[0]!._id,
      productId,
      variantLabel: "Family Pack",
      attributes: {
        size: "XL",
        nested: {
          finish: ["matte", "gloss"],
          metadata: {
            recyclable: true,
            notes: null,
          },
        },
      },
      priceOverride: 2.1,
    });
    expect(storedProduct?.revision).toBe(2);
    expect(storedVariants).toHaveLength(1);
    expect(embeddingsAfter).toHaveLength(2);
    expect(embeddingsAfter.map((embedding) => embedding._id)).not.toEqual(
      embeddingsBefore.map((embedding) => embedding._id),
    );
    expect(embeddingsAfter.every((embedding) => embedding.textContent.includes("Family Pack"))).toBe(
      true,
    );
    expect(embeddingsAfter.some((embedding) => embedding.textContent.includes("finish: [matte, gloss]"))).toBe(
      true,
    );
  });

  it("updates a variant, clears priceOverride, and refreshes embeddings", async () => {
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
        revision: 1,
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
      variantLabel: "Extra Large",
      attributes: {
        size: "XL",
        nested: {
          palette: ["white", "kraft"],
        },
      },
      priceOverride: null,
    });
    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));
    const storedVariant = await t.run(async (ctx) => ctx.db.get(variantId));
    const embeddings = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(updatedVariant).toEqual({
      id: variantId,
      productId,
      variantLabel: "Extra Large",
      attributes: {
        size: "XL",
        nested: {
          palette: ["white", "kraft"],
        },
      },
    });
    expect(storedVariant).toMatchObject({
      variantLabel: "Extra Large",
      attributes: {
        size: "XL",
        nested: {
          palette: ["white", "kraft"],
        },
      },
    });
    expect(storedVariant?.priceOverride).toBeUndefined();
    expect(storedProduct?.revision).toBe(2);
    expect(embeddings.every((embedding) => embedding.textContent.includes("Extra Large"))).toBe(true);
  });

  it("updates a variant without priceOverride and preserves the existing override", async () => {
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
        revision: 1,
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
      variantLabel: "Extra Large",
      attributes: {
        size: "XL",
      },
    });
    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));
    const storedVariant = await t.run(async (ctx) => ctx.db.get(variantId));
    const embeddings = await t.run(async (ctx) =>
      ctx.db
        .query("embeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect(),
    );

    expect(updatedVariant).toEqual({
      id: variantId,
      productId,
      variantLabel: "Extra Large",
      attributes: {
        size: "XL",
      },
      priceOverride: 1.45,
    });
    expect(storedVariant).toMatchObject({
      variantLabel: "Extra Large",
      attributes: {
        size: "XL",
      },
      priceOverride: 1.45,
    });
    expect(storedProduct?.revision).toBe(2);
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
        revision: 1,
        nameEn: "Burger Box",
      });
      const variantId = await ctx.db.insert("productVariants", {
        productId,
        variantLabel: "Large",
        attributes: {
          size: "L",
        },
      });
      const retainedVariantId = await ctx.db.insert("productVariants", {
        productId,
        variantLabel: "Small",
        attributes: {
          size: "S",
        },
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
    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));
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
    expect(storedProduct?.revision).toBe(2);
    expect(remainingVariants.map((variant) => variant._id)).toEqual([retainedVariantId]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings.every((embedding) => !embedding.textContent.includes("Large"))).toBe(true);
    expect(embeddings.every((embedding) => embedding.textContent.includes("Small"))).toBe(true);
  });

  it("rejects stale variant mutations when the product revision changed after snapshot read", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, productId, variantId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000617",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        revision: 1,
        nameEn: "Burger Box",
      });
      const variantId = await ctx.db.insert("productVariants", {
        productId,
        variantLabel: "Large",
        attributes: {
          size: "L",
        },
      });

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 86 : 87),
          textContent: `${language} text`,
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

    const createSnapshot = await t.query(internal.products.getVariantCreateSnapshot, {
      companyId,
      productId,
    });
    const updateSnapshot = await t.query(internal.products.getVariantUpdateSnapshot, {
      companyId,
      productId,
      variantId,
    });
    const deleteSnapshot = await t.query(internal.products.getVariantUpdateSnapshot, {
      companyId,
      productId,
      variantId,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(productId, {
        revision: 2,
        nameEn: "Concurrent change",
      });
    });

    await expect(
      t.mutation(internal.products.insertVariantWithEmbeddings, {
        companyId,
        productId,
        expectedRevision: createSnapshot!.expectedRevision,
        variantLabel: "Family Pack",
        attributes: {
          size: "XL",
        },
        englishEmbedding: createEmbedding(90),
        arabicEmbedding: createEmbedding(91),
        englishText: "english text",
        arabicText: "arabic text",
      }),
    ).rejects.toThrow("CONFLICT: Product was modified concurrently; retry the update");

    await expect(
      t.mutation(internal.products.patchVariantWithEmbeddings, {
        companyId,
        productId,
        variantId,
        expectedRevision: updateSnapshot!.expectedRevision,
        variantLabel: "Updated",
        englishEmbedding: createEmbedding(92),
        arabicEmbedding: createEmbedding(93),
        englishText: "english text",
        arabicText: "arabic text",
      }),
    ).rejects.toThrow("CONFLICT: Product was modified concurrently; retry the update");

    await expect(
      t.mutation(internal.products.removeVariantWithEmbeddings, {
        companyId,
        productId,
        variantId,
        expectedRevision: deleteSnapshot!.expectedRevision,
        englishEmbedding: createEmbedding(94),
        arabicEmbedding: createEmbedding(95),
        englishText: "english text",
        arabicText: "arabic text",
      }),
    ).rejects.toThrow("CONFLICT: Product was modified concurrently; retry the update");
  });

  it("rejects stale updates when the product changed after the snapshot was read", async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000611",
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

      for (const language of ["en", "ar"] as const) {
        await ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: createEmbedding(language === "en" ? 60 : 70),
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

    const snapshot = await t.query(internal.products.getUpdateSnapshot, {
      companyId,
      productId,
    });

    expect(snapshot?.expectedRevision).toBe(0);

    await t.run(async (ctx) => {
      await ctx.db.patch(productId, {
        nameEn: "Concurrent change",
        revision: 1,
      });
    });

    await expect(
      t.mutation(internal.products.patchProductWithEmbeddings, {
        companyId,
        productId,
        nameEn: "Stale action update",
        expectedRevision: snapshot!.expectedRevision,
      }),
    ).rejects.toThrow("CONFLICT: Product was modified concurrently; retry the update");

    const storedProduct = await t.run(async (ctx) => ctx.db.get(productId));
    expect(storedProduct).toMatchObject({
      nameEn: "Concurrent change",
      revision: 1,
    });
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
