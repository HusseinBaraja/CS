import { afterEach, describe, expect, test } from 'bun:test';
import type { GroundingContextBlock } from '@cs/ai';
import type { ConvexAdminClient, Id } from '@cs/db';
import { buildRetrievalQueryText, createProductRetrievalService, generateRetrievalQueryEmbedding } from './index';

const COMPANY_ID = "company-1" as Id<"companies">;
const originalConsoleError = globalThis.console?.error;

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
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: Record<string, string | number | boolean>;
  basePrice?: number;
  baseCurrency?: string;
  images: Array<{ id: string; key: string; contentType: string; sizeBytes: number; uploadedAt: number }>;
  variants: Array<{ id: string; productId: string; variantLabel: string; attributes: Record<string, unknown>; priceOverride?: number }>;
}> = {}) => ({
  id: overrides.id ?? "product-1",
  companyId: COMPANY_ID,
  categoryId: overrides.categoryId ?? "category-1",
  nameEn: overrides.nameEn ?? "Burger Box",
  ...(overrides.nameAr ? { nameAr: overrides.nameAr } : {}),
  ...(overrides.descriptionEn ? { descriptionEn: overrides.descriptionEn } : {}),
  ...(overrides.descriptionAr ? { descriptionAr: overrides.descriptionAr } : {}),
  ...(overrides.specifications ? { specifications: overrides.specifications } : {}),
  ...(overrides.basePrice !== undefined ? { basePrice: overrides.basePrice } : {}),
  ...(overrides.baseCurrency ? { baseCurrency: overrides.baseCurrency } : {}),
  images: overrides.images ?? [],
  variants: overrides.variants ?? [],
});

afterEach(() => {
  if (globalThis.console) {
    globalThis.console.error = originalConsoleError;
  }
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
      resolution: {
        strategy: "standalone",
        recentTurnsUsed: 0,
        detectedOptionCount: 0,
        standaloneQuery: "",
      },
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
      resolution: {
        strategy: "standalone",
        recentTurnsUsed: 0,
        detectedOptionCount: 0,
        standaloneQuery: "burger",
      },
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
          specifications: {
            material: "paper",
            recyclable: true,
          },
          basePrice: 12.5,
          baseCurrency: "SAR",
          images: [
            {
              id: "image-1",
              key: "products/image-1.jpg",
              contentType: "image/jpeg",
              sizeBytes: 1_024,
              uploadedAt: 1,
            },
          ],
          variants: [
            {
              id: "variant-2",
              productId: "product-1",
              variantLabel: "Large",
              attributes: {
                size: "L",
                finish: ["matte", "gloss"],
              },
              priceOverride: 13.5,
            },
            {
              id: "variant-1",
              productId: "product-1",
              variantLabel: "Family Pack",
              attributes: {
                size: "XL",
              },
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
    expect(result.resolution).toEqual({
      strategy: "standalone",
      recentTurnsUsed: 0,
      detectedOptionCount: 0,
      standaloneQuery: "Burger Box",
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.product.imageCount).toBe(1);
    expect(contextBlock).toEqual({
      id: "product-1",
      heading: "Burger Box",
      body: [
        "Name (EN): Burger Box",
        "Name (AR): علبة برجر",
        "Description: Disposable meal packaging",
        "Base price: 12.5 SAR",
        "Specifications:",
        "- material: paper",
        "- recyclable: true",
        "Variants:",
        '- Family Pack | attributes: { size: XL }',
        '- Large | attributes: { finish: [matte, gloss], size: L } | priceOverride: 13.5',
        "Images available: 1",
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
    expect(result.resolution).toEqual({
      strategy: "standalone",
      recentTurnsUsed: 0,
      detectedOptionCount: 0,
      standaloneQuery: "كوب شوربة",
    });
    expect(result.contextBlocks[0]).toEqual({
      id: "product-2",
      heading: "كوب شوربة",
      body: [
        "Name (EN): Soup Cup",
        "Name (AR): كوب شوربة",
        "Description: Single-wall soup cup",
        "Images available: 0",
      ].join("\n"),
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
      resolution: {
        strategy: "standalone",
        recentTurnsUsed: 0,
        detectedOptionCount: 0,
        standaloneQuery: "tray",
      },
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
    expect(result.resolution).toEqual({
      strategy: "standalone",
      recentTurnsUsed: 0,
      detectedOptionCount: 0,
      standaloneQuery: "boxes",
    });
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

  test("runs contextual retrieval from recent thread and prefers the latest assistant option frame", async () => {
    const embeddingInputs: string[] = [];
    const { client, calls } = createClientStub({
      action: async (_reference, args) => {
        const { embedding } = args as { embedding: number[] };
        if (embedding[0] === 1) {
          return [
            {
              _id: "embedding-bag-standalone",
              _score: 0.9,
              productId: "product-bag",
              textContent: "Standalone bag hit",
              language: "ar",
            },
            {
              _id: "embedding-cutlery-standalone",
              _score: 0.61,
              productId: "product-cutlery",
              textContent: "Standalone cutlery hit",
              language: "ar",
            },
          ];
        }

        return [
          {
            _id: "embedding-cutlery-context",
            _score: 0.88,
            productId: "product-cutlery",
            textContent: "Contextual cutlery hit",
            language: "ar",
          },
          {
            _id: "embedding-bag-context",
            _score: 0.7,
            productId: "product-bag",
            textContent: "Contextual bag hit",
            language: "ar",
          },
        ];
      },
      query: async (_reference, args) => {
        const { productIds } = args as { productIds: string[] };
        return productIds.map((productId) =>
          createProduct({
            id: productId,
            nameEn: productId === "product-cutlery" ? "Wrapped Cutlery Set" : "Heavy Duty T-Shirt Bag",
            nameAr: productId === "product-cutlery" ? "طقم أدوات مائدة مغلف" : "كيس تي شيرت ثقيل",
          }),
        );
      },
    });
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async (text) => {
        embeddingInputs.push(text);
        return [embeddingInputs.length];
      },
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "الاول",
      language: "ar",
      conversationHistory: [
        { role: "user", text: "بكم طقم المائدة المغلف" },
        {
          role: "assistant",
          text: [
            "طقم أدوات المائدة المغلف متوفر بنوعين:",
            "1. الطقم الممتاز (Premium Set): 0.34 ريال سعودي.",
            "2. الطقم القياسي (Standard Set): 0.28 ريال سعودي.",
            "هل تود معرفة المزيد عن مواصفات أي من النوعين؟",
          ].join("\n"),
        },
      ],
    });

    expect(embeddingInputs).toEqual([
      "language:ar\nquery:الاول",
      [
        "language:ar",
        "latest_user:الاول",
        "recent_thread:",
        "user:بكم طقم المائدة المغلف",
        "assistant:طقم أدوات المائدة المغلف متوفر بنوعين:",
        "assistant_options:",
        "الطقم الممتاز (Premium Set): 0.34 ريال سعودي.",
        "الطقم القياسي (Standard Set): 0.28 ريال سعودي.",
      ].join("\n"),
    ]);
    expect(result.outcome).toBe("grounded");
    expect(result.topScore).toBe(0.88);
    expect(result.resolution).toEqual({
      strategy: "contextual_recent_thread",
      recentTurnsUsed: 2,
      detectedOptionCount: 2,
      standaloneQuery: "الاول",
      contextualQuery: embeddingInputs[1],
    });
    expect(result.candidates.map((candidate) => candidate.productId)).toEqual([
      "product-cutlery",
      "product-bag",
    ]);
    expect(result.candidates[0]?.matchedEmbeddingId).toBe("embedding-cutlery-context");
    expect(calls.actions).toHaveLength(2);
  });

  test("merges contextual retrieval with standalone retrieval and keeps explicit new queries dominant without option frames", async () => {
    const embeddingInputs: string[] = [];
    const { client } = createClientStub({
      action: async (_reference, args) => {
        const { embedding } = args as { embedding: number[] };
        if (embedding[0] === 1) {
          return [
            {
              _id: "embedding-tray-standalone",
              _score: 0.93,
              productId: "product-tray",
              textContent: "Standalone tray hit",
              language: "ar",
            },
          ];
        }

        return [
          {
            _id: "embedding-cutlery-context",
            _score: 0.72,
            productId: "product-cutlery",
            textContent: "Contextual cutlery hit",
            language: "ar",
          },
        ];
      },
      query: async (_reference, args) => {
        const { productIds } = args as { productIds: string[] };
        return productIds.map((productId) =>
          createProduct({
            id: productId,
            nameEn: productId === "product-tray" ? "Foil Tray" : "Wrapped Cutlery Set",
            nameAr: productId === "product-tray" ? "صينية ألمنيوم فويل" : "طقم أدوات مائدة مغلف",
          }),
        );
      },
    });
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async (text) => {
        embeddingInputs.push(text);
        return [embeddingInputs.length];
      },
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "صينية ألمنيوم فويل",
      language: "ar",
      conversationHistory: [
        { role: "user", text: "بكم طقم المائدة المغلف" },
        { role: "assistant", text: "سعر الطقم الممتاز هو 0.34 ريال سعودي." },
      ],
    });

    expect(result.outcome).toBe("grounded");
    expect(result.topScore).toBe(0.93);
    expect(result.resolution).toEqual({
      strategy: "merged",
      recentTurnsUsed: 2,
      detectedOptionCount: 0,
      standaloneQuery: "صينية ألمنيوم فويل",
      contextualQuery: embeddingInputs[1],
    });
    expect(result.candidates.map((candidate) => candidate.productId)).toEqual([
      "product-tray",
      "product-cutlery",
    ]);
  });

  test("falls back to standalone hits when contextual retrieval fails", async () => {
    const consoleErrors: Array<{ message: unknown; payload: unknown }> = [];
    if (globalThis.console) {
      globalThis.console.error = (message?: unknown, payload?: unknown) => {
        consoleErrors.push({ message, payload });
      };
    }

    const { client, calls } = createClientStub({
      action: async (_reference, args) => {
        const { embedding } = args as { embedding: number[] };
        if (embedding[0] === 1) {
          return [
            {
              _id: "embedding-tray-standalone",
              _score: 0.93,
              productId: "product-tray",
              textContent: "Standalone tray hit",
              language: "ar",
            },
          ];
        }

        throw new Error("contextual vector search unavailable");
      },
      query: async () => [
        createProduct({
          id: "product-tray",
          nameEn: "Foil Tray",
          nameAr: "صينية ألمنيوم فويل",
        }),
      ],
    });
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async (_text) => [calls.actions.length + 1],
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "صينية ألمنيوم فويل",
      language: "ar",
      conversationHistory: [
        { role: "user", text: "بكم طقم المائدة المغلف" },
        { role: "assistant", text: "سعر الطقم الممتاز هو 0.34 ريال سعودي." },
      ],
    });

    expect(result.outcome).toBe("grounded");
    expect(result.topScore).toBe(0.93);
    expect(result.resolution).toEqual({
      strategy: "standalone",
      recentTurnsUsed: 2,
      detectedOptionCount: 0,
      standaloneQuery: "صينية ألمنيوم فويل",
    });
    expect(result.candidates.map((candidate) => candidate.productId)).toEqual(["product-tray"]);
    expect(consoleErrors).toEqual([
      {
        message: "catalog contextual retrieval failed; falling back to standalone",
        payload: {
          companyId: COMPANY_ID,
          language: "ar",
          recentTurnsUsed: 2,
          detectedOptionCount: 0,
          hasContextualQuery: true,
          error: expect.objectContaining({
            name: "Error",
            message: "contextual vector search unavailable",
          }),
        },
      },
    ]);
  });

  test("returns no_hits instead of rejecting when contextual retrieval fails after empty standalone hits", async () => {
    const consoleErrors: Array<{ message: unknown; payload: unknown }> = [];
    if (globalThis.console) {
      globalThis.console.error = (message?: unknown, payload?: unknown) => {
        consoleErrors.push({ message, payload });
      };
    }

    const { client } = createClientStub({
      action: async (_reference, args) => {
        const { embedding } = args as { embedding: number[] };
        if (embedding[0] === 1) {
          return [];
        }

        throw new Error("contextual embedding failed");
      },
    });
    let embeddingCallCount = 0;
    const service = createProductRetrievalService({
      createClient: () => client,
      generateEmbedding: async () => {
        embeddingCallCount += 1;
        if (embeddingCallCount === 1) {
          return [1];
        }

        throw new Error("contextual embedding failed");
      },
    });

    const result = await service.retrieveCatalogContext({
      companyId: COMPANY_ID,
      query: "صينية ألمنيوم فويل",
      language: "ar",
      conversationHistory: [
        { role: "user", text: "بكم طقم المائدة المغلف" },
        { role: "assistant", text: "سعر الطقم الممتاز هو 0.34 ريال سعودي." },
      ],
    });

    expect(result).toEqual({
      outcome: "empty",
      reason: "no_hits",
      query: "صينية ألمنيوم فويل",
      language: "ar",
      resolution: {
        strategy: "standalone",
        recentTurnsUsed: 2,
        detectedOptionCount: 0,
        standaloneQuery: "صينية ألمنيوم فويل",
      },
      candidates: [],
      contextBlocks: [],
    });
    expect(consoleErrors).toEqual([
      {
        message: "catalog contextual retrieval failed; falling back to standalone",
        payload: {
          companyId: COMPANY_ID,
          language: "ar",
          recentTurnsUsed: 2,
          detectedOptionCount: 0,
          hasContextualQuery: true,
          error: expect.objectContaining({
            name: "Error",
            message: "contextual embedding failed",
          }),
        },
      },
    ]);
  });
});
