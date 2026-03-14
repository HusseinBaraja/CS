/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

const createEmbedding = (seed: number): number[] =>
  Array.from({ length: 768 }, (_, index) => seed + index / 1000);

describe.skipIf(typeof import.meta.glob !== "function")("convex retrieval contract", () => {
  it("returns enriched metadata for English vector hits and excludes Arabic matches", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId, englishEmbeddingId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000700",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        nameAr: "علبة برجر",
      });

      await ctx.db.insert("embeddings", {
        companyId,
        productId,
        embedding: createEmbedding(10),
        textContent: "Arabic burger box embedding",
        language: "ar",
        companyLanguage: `${companyId}:ar`,
      });

      const englishEmbeddingId = await ctx.db.insert("embeddings", {
        companyId,
        productId,
        embedding: createEmbedding(1),
        textContent: "English burger box embedding",
        language: "en",
        companyLanguage: `${companyId}:en`,
      });

      return {
        companyId,
        productId,
        englishEmbeddingId,
      };
    });

    const results = await t.action(api.vectorSearch.vectorSearchByEmbedding, {
      companyId,
      language: "en",
      embedding: createEmbedding(1),
      count: 5,
    });

    expect(results).toEqual([
      {
        _id: englishEmbeddingId,
        _score: expect.any(Number),
        productId,
        textContent: "English burger box embedding",
        language: "en",
      },
    ]);
  });

  it("uses the Arabic company-language filter for Arabic retrieval", async () => {
    const t = convexTest(schema, modules);

    const { companyId, arabicEmbeddingId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000701",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Soup Cup",
        nameAr: "كوب شوربة",
      });

      await ctx.db.insert("embeddings", {
        companyId,
        productId,
        embedding: createEmbedding(20),
        textContent: "English soup cup embedding",
        language: "en",
        companyLanguage: `${companyId}:en`,
      });

      const arabicEmbeddingId = await ctx.db.insert("embeddings", {
        companyId,
        productId,
        embedding: createEmbedding(2),
        textContent: "Arabic soup cup embedding",
        language: "ar",
        companyLanguage: `${companyId}:ar`,
      });

      return {
        companyId,
        arabicEmbeddingId,
        productId,
      };
    });

    const results = await t.action(api.vectorSearch.vectorSearchByEmbedding, {
      companyId,
      language: "ar",
      embedding: createEmbedding(2),
      count: 5,
    });

    expect(results).toEqual([
      {
        _id: arabicEmbeddingId,
        _score: expect.any(Number),
        productId,
        textContent: "Arabic soup cup embedding",
        language: "ar",
      },
    ]);
  });

  it("hydrates products for RAG in the caller-supplied order and skips out-of-scope ids", async () => {
    const t = convexTest(schema, modules);

    const { companyId, firstProductId, secondProductId, foreignProductId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000702",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000703",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const otherCategoryId = await ctx.db.insert("categories", {
        companyId: otherCompanyId,
        nameEn: "Foreign",
      });
      const firstProductId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Alpha Box",
      });
      const secondProductId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Beta Cup",
      });
      const foreignProductId = await ctx.db.insert("products", {
        companyId: otherCompanyId,
        categoryId: otherCategoryId,
        nameEn: "Foreign Tray",
      });

      await ctx.db.insert("productVariants", {
        productId: secondProductId,
        variantLabel: "Large",
        attributes: {
          size: "L",
        },
      });

      return {
        companyId,
        firstProductId,
        secondProductId,
        foreignProductId,
      };
    });

    const products = await t.query(internal.products.getManyForRag, {
      companyId,
      productIds: [secondProductId, foreignProductId, firstProductId],
    });

    expect(products).toEqual([
      {
        id: secondProductId,
        companyId,
        categoryId: expect.any(String),
        nameEn: "Beta Cup",
        images: [],
        variants: [
          {
            id: expect.any(String),
            productId: secondProductId,
            variantLabel: "Large",
            attributes: {
              size: "L",
            },
          },
        ],
      },
      {
        id: firstProductId,
        companyId,
        categoryId: expect.any(String),
        nameEn: "Alpha Box",
        images: [],
        variants: [],
      },
    ]);
  });
});
