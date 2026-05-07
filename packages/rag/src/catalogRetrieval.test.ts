import { describe, expect, test } from 'bun:test';
import type { GroundingContextBlock } from '@cs/ai';
import type { ConvexAdminClient, Id } from '@cs/db';
import { buildRetrievalQueryText, createProductRetrievalService, generateRetrievalQueryEmbedding } from './catalogRetrieval';

const COMPANY_ID = "company-1" as Id<"companies">;

const createClientStub = (overrides: Partial<{
  action: (reference: unknown, args: unknown) => Promise<unknown>;
  query: (reference: unknown, args: unknown) => Promise<unknown>;
}> = {}) => {
  const calls: { actions: Array<{ reference: unknown; args: unknown }>; queries: Array<{ reference: unknown; args: unknown }> } = {
    actions: [],
    queries: [],
  };

  return {
    client: {
      action: async (reference: unknown, args: unknown) => {
        calls.actions.push({ reference, args });
        return overrides.action?.(reference, args);
      },
      mutation: async () => {
        throw new Error("mutation should not be called in retrieval tests");
      },
      query: async (reference: unknown, args: unknown) => {
        calls.queries.push({ reference, args });
        return overrides.query?.(reference, args);
      },
    } as ConvexAdminClient,
    calls,
  };
};

const createProduct = (overrides: Partial<{
  id: string;
  categoryId: string;
  productNo: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
  primaryImage?: string;
  variants: Array<{ id: string; companyId: string; productId: string; label: string; price?: number }>;
}> = {}) => ({
  id: overrides.id ?? "product-1",
  companyId: COMPANY_ID,
  categoryId: overrides.categoryId ?? "category-1",
  ...(overrides.productNo ? { productNo: overrides.productNo } : {}),
  nameEn: overrides.nameEn ?? "Burger Box",
  ...(overrides.nameAr ? { nameAr: overrides.nameAr } : {}),
  ...(overrides.descriptionEn ? { descriptionEn: overrides.descriptionEn } : {}),
  ...(overrides.descriptionAr ? { descriptionAr: overrides.descriptionAr } : {}),
  ...(overrides.price !== undefined ? { price: overrides.price } : {}),
  ...(overrides.currency ? { currency: overrides.currency } : {}),
  ...(overrides.primaryImage ? { primaryImage: overrides.primaryImage } : {}),
  variants: overrides.variants ?? [],
});

describe("@cs/rag", () => {
  test("buildRetrievalQueryText trims the query and prefixes the language", () => {
    expect(
      buildRetrievalQueryText({
        language: "en",
        query: "  burger boxes  ",
      }),
    ).toBe("language:en\nquery:burger boxes");
  });

  test("generateRetrievalQueryEmbedding uses the normalized retrieval query text", async () => {
    let receivedText: string | undefined;
    let receivedOptions: { apiKey?: string; outputDimensionality?: number } | undefined;

    const embedding = await generateRetrievalQueryEmbedding(
      {
        language: "ar",
        query: "  علبة برجر  ",
        apiKey: "test-key",
      },
      {
        generateEmbedding: async (text, options) => {
          receivedText = text;
          receivedOptions = options;
          return [1, 2, 3];
        },
      },
    );

    expect(embedding).toEqual([1, 2, 3]);
    expect(receivedText).toBe("language:ar\nquery:علبة برجر");
    expect(receivedOptions).toEqual({
      apiKey: "test-key",
      outputDimensionality: 768,
    });
  });

  test("returns empty_query without calling Gemini or Convex for blank input", async () => {
    let embeddingCallCount = 0;
    const { client, calls } = createClientStub();
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => {
        embeddingCallCount += 1;
        return [];
      },
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "   ",
      language: "en",
    });

    expect(result).toEqual({
      outcome: "empty",
      reason: "empty_query",
      query: "",
      language: "en",
      candidates: [],
      contextBlocks: [],
    });
    expect(embeddingCallCount).toBe(0);
    expect(calls.actions).toHaveLength(0);
    expect(calls.queries).toHaveLength(0);
  });

  test("returns no_hits when vector search is empty", async () => {
    const { client, calls } = createClientStub({
      action: async () => [],
    });
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 1),
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "burger",
      language: "en",
    });

    expect(result).toEqual({
      outcome: "empty",
      reason: "no_hits",
      query: "burger",
      language: "en",
      candidates: [],
      contextBlocks: [],
    });
    expect(calls.actions[0]?.args).toEqual({
      companyId: COMPANY_ID,
      language: "en",
      embedding: Array.from({ length: 768 }, () => 1),
      count: 5,
    });
  });

  test("passes a non-default maxResults through to Convex vector search", async () => {
    const { client, calls } = createClientStub({
      action: async () => [],
    });
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 1),
    });

    await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "burger",
      language: "en",
      maxResults: 3,
    });

    expect(calls.actions[0]?.args).toEqual({
      companyId: COMPANY_ID,
      language: "en",
      embedding: Array.from({ length: 768 }, () => 1),
      count: 3,
    });
  });

  test("returns grounded English retrieval with deterministic context blocks", async () => {
    const { client, calls } = createClientStub({
      action: async () => [
        {
          _id: "embedding-1",
          _score: 0.91,
          productId: "product-1",
          textContent: "English burger box embedding",
          language: "en",
        },
      ],
      query: async () => [
        createProduct({
          id: "product-1",
          nameEn: "Burger Box",
          nameAr: "علبة برجر",
          descriptionEn: "Disposable meal packaging",
          price: 12.5,
          currency: "SAR",
          primaryImage: "products/image-1.jpg",
          variants: [
            {
              id: "variant-2",
              companyId: COMPANY_ID,
              productId: "product-1",
              label: "Large",
              price: 13.5,
            },
            {
              id: "variant-1",
              companyId: COMPANY_ID,
              productId: "product-1",
              label: "Family Pack",
            },
          ],
        }),
      ],
    });

    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 2),
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "Burger Box",
      language: "en",
    });

    const contextBlock = result.contextBlocks[0] as GroundingContextBlock;

    expect(result.outcome).toBe("grounded");
    expect(result.topScore).toBe(0.91);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.product.primaryImage).toBe("products/image-1.jpg");
    expect(contextBlock).toEqual({
      id: "product-1",
      heading: "Burger Box",
      body: [
        "Name (EN): Burger Box",
        "Name (AR): علبة برجر",
        "Description: Disposable meal packaging",
        "Price: 12.5 SAR",
        "Variants:",
        "- Family Pack",
        "- Large | price: 13.5",
        "Primary image is available.",
      ].join("\n"),
    });
    expect(calls.queries[0]?.args).toEqual({
      companyId: COMPANY_ID,
      productIds: ["product-1"],
    });
  });

  test("returns grounded Arabic retrieval and prefers Arabic copy with English fallback", async () => {
    const { client } = createClientStub({
      action: async () => [
        {
          _id: "embedding-2",
          _score: 0.87,
          productId: "product-2",
          textContent: "Arabic soup cup embedding",
          language: "ar",
        },
      ],
      query: async () => [
        createProduct({
          id: "product-2",
          nameEn: "Soup Cup",
          nameAr: "كوب شوربة",
          descriptionEn: "Single-wall soup cup",
        }),
      ],
    });

    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 3),
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "كوب شوربة",
      language: "ar",
    });

    expect(result.outcome).toBe("grounded");
    expect(result.contextBlocks[0]).toEqual({
      id: "product-2",
      heading: "كوب شوربة",
      body: [
        "Name (EN): Soup Cup",
        "Name (AR): كوب شوربة",
        "Description: Single-wall soup cup",
      ].join("\n"),
    });
  });

  test("falls back to product number for context block heading when names are absent", async () => {
    const { client } = createClientStub({
      action: async () => [
        {
          _id: "embedding-5",
          _score: 0.89,
          productId: "product-5",
          textContent: "Product number only embedding",
          language: "en",
        },
      ],
      query: async () => [
        createProduct({
          id: "product-5",
          productNo: "SKU-500",
          nameEn: "",
        }),
      ],
    });

    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 7),
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "SKU-500",
      language: "en",
    });

    expect(result.contextBlocks[0]).toMatchObject({
      id: "product-5",
      heading: "SKU-500",
    });
  });

  test("returns low_signal when the best score is below the threshold", async () => {
    const { client } = createClientStub({
      action: async () => [
        {
          _id: "embedding-3",
          _score: 0.22,
          productId: "product-3",
          textContent: "Weak match",
          language: "en",
        },
      ],
      query: async () => [
        createProduct({
          id: "product-3",
          nameEn: "Tray",
        }),
      ],
    });
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 4),
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "tray",
      language: "en",
      minScore: 0.55,
    });

    expect(result).toMatchObject({
      outcome: "low_signal",
      reason: "below_min_score",
      query: "tray",
      language: "en",
      topScore: 0.22,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.contextBlocks).toEqual([]);
  });

  test("dedupes multiple hits for the same product and preserves score order across products", async () => {
    const { client, calls } = createClientStub({
      action: async () => [
        {
          _id: "embedding-1",
          _score: 0.81,
          productId: "product-1",
          textContent: "First product hit",
          language: "en",
        },
        {
          _id: "embedding-2",
          _score: 0.92,
          productId: "product-2",
          textContent: "Second product hit",
          language: "en",
        },
        {
          _id: "embedding-3",
          _score: 0.95,
          productId: "product-1",
          textContent: "Better first product hit",
          language: "en",
        },
      ],
      query: async (_reference, args) => {
        const { productIds } = args as { productIds: string[] };
        return productIds.map((productId) =>
          createProduct({
            id: productId,
            nameEn: productId === "product-1" ? "Alpha Box" : "Beta Cup",
          }),
        );
      },
    });

    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 5),
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "boxes",
      language: "en",
      maxContextBlocks: 2,
    });

    expect(result.outcome).toBe("grounded");
    expect(result.candidates.map((candidate) => ({
      productId: candidate.productId,
      score: candidate.score,
      matchedEmbeddingId: candidate.matchedEmbeddingId,
    }))).toEqual([
      {
        productId: "product-1",
        score: 0.95,
        matchedEmbeddingId: "embedding-3",
      },
      {
        productId: "product-2",
        score: 0.92,
        matchedEmbeddingId: "embedding-2",
      },
    ]);
    expect(calls.queries[0]?.args).toEqual({
      companyId: COMPANY_ID,
      productIds: ["product-1", "product-2"],
    });
  });

  test("passes the requested language through to Convex vector search", async () => {
    const { client, calls } = createClientStub({
      action: async () => [
        {
          _id: "embedding-4",
          _score: 0.73,
          productId: "product-4",
          textContent: "Arabic hit",
          language: "ar",
        },
      ],
      query: async () => [
        createProduct({
          id: "product-4",
          nameEn: "Cup",
          nameAr: "كوب",
        }),
      ],
    });
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => Array.from({ length: 768 }, () => 6),
    });

    await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "كوب",
      language: "ar",
    });

    expect(calls.actions[0]?.args).toEqual({
      companyId: "company-1",
      language: "ar",
      embedding: Array.from({ length: 768 }, () => 6),
      count: 5,
    });
  });
});
