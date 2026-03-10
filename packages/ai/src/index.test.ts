import { afterEach, describe, expect, test } from 'bun:test';
import {
  GEMINI_EMBEDDING_DIMENSIONS,
  generateGeminiEmbedding,
  generateGeminiEmbeddings,
  setGeminiClientFactoryForTests,
} from './index';

const createEmbedding = (seed: number): number[] =>
  Array.from({ length: GEMINI_EMBEDDING_DIMENSIONS }, (_, index) => seed + index / 1000);

let resetGeminiClientFactory: (() => void) | null = null;

afterEach(() => {
  resetGeminiClientFactory?.();
  resetGeminiClientFactory = null;
  delete process.env.GEMINI_API_KEY;
});

describe("@cs/ai", () => {
  test("generates 768-dimension Gemini embeddings", async () => {
    resetGeminiClientFactory = setGeminiClientFactoryForTests(() => ({
      models: {
        embedContent: async (params) => {
          expect(params.model).toBe("gemini-embedding-001");
          expect(params.config?.outputDimensionality).toBe(768);
          expect(params.contents).toEqual(["English product", "Arabic product"]);

          return {
            embeddings: [
              { values: createEmbedding(1) },
              { values: createEmbedding(2) },
            ],
          };
        },
      },
    }));

    const embeddings = await generateGeminiEmbeddings(
      ["English product", "Arabic product"],
      { apiKey: "test-key" },
    );

    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toHaveLength(768);
    expect(embeddings[1]).toHaveLength(768);
  });

  test("rejects invalid Gemini embedding payloads", async () => {
    resetGeminiClientFactory = setGeminiClientFactoryForTests(() => ({
      models: {
        embedContent: async () => ({
          embeddings: [{ values: [1, 2, 3] }],
        }),
      },
    }));

    await expect(
      generateGeminiEmbedding("Broken embedding", { apiKey: "test-key" }),
    ).rejects.toThrow("Gemini embedding length mismatch");
  });

  test("resolves GEMINI_API_KEY lazily when no explicit key is provided", async () => {
    let receivedApiKey: string | undefined;
    resetGeminiClientFactory = setGeminiClientFactoryForTests((apiKey) => {
      receivedApiKey = apiKey;

      return {
        models: {
          embedContent: async () => ({
            embeddings: [{ values: createEmbedding(3) }],
          }),
        },
      };
    });

    await expect(generateGeminiEmbedding("Needs env")).rejects.toThrow(
      "Missing required environment variable: GEMINI_API_KEY",
    );

    process.env.GEMINI_API_KEY = "lazy-key";

    const embedding = await generateGeminiEmbedding("Needs env");

    expect(receivedApiKey).toBe("lazy-key");
    expect(embedding).toHaveLength(768);
  });
});
