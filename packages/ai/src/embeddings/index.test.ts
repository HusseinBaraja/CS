import { afterEach, describe, expect, test } from 'bun:test';
import { GEMINI_EMBEDDING_DIMENSIONS, generateGeminiEmbedding, generateGeminiEmbeddings } from '@cs/ai';
import * as geminiClientFactoryModule from './geminiClientFactory';
import * as embeddingsTestUtilsModule from './testUtils';
import { setGeminiClientFactoryForTests } from './testUtils';

const createEmbedding = (seed: number): number[] =>
  Array.from({ length: GEMINI_EMBEDDING_DIMENSIONS }, (_, index) => seed + index / 1000);

let resetGeminiClientFactory: (() => void) | null = null;
const previousGeminiApiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  resetGeminiClientFactory?.();
  resetGeminiClientFactory = null;
  if (previousGeminiApiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = previousGeminiApiKey;
  }
});

describe("@cs/ai embeddings", () => {
  test("exports the Gemini client factory only on the production path", () => {
    expect(geminiClientFactoryModule.createGeminiClient).toBeDefined();
    expect("setGeminiClientFactoryForTests" in geminiClientFactoryModule).toBe(false);
    expect(embeddingsTestUtilsModule.setGeminiClientFactoryForTests).toBeDefined();
  });

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

  test("rejects invalid output dimensionality before calling Gemini", async () => {
    let factoryCallCount = 0;
    let embedContentCallCount = 0;

    resetGeminiClientFactory = setGeminiClientFactoryForTests(() => {
      factoryCallCount += 1;

      return {
        models: {
          embedContent: async () => {
            embedContentCallCount += 1;

            return {
              embeddings: [{ values: createEmbedding(1) }],
            };
          },
        },
      };
    });

    for (const outputDimensionality of [0, -1, 1.5, Number.NaN]) {
      await expect(
        generateGeminiEmbedding("Invalid dimensions", {
          apiKey: "test-key",
          outputDimensionality,
        }),
      ).rejects.toThrow("positive integer");
    }

    expect(factoryCallCount).toBe(0);
    expect(embedContentCallCount).toBe(0);
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

    delete process.env.GEMINI_API_KEY;

    await expect(generateGeminiEmbedding("Needs env")).rejects.toThrow(
      "Missing required environment variable: GEMINI_API_KEY",
    );

    process.env.GEMINI_API_KEY = "lazy-key";

    const embedding = await generateGeminiEmbedding("Needs env");

    expect(receivedApiKey).toBe("lazy-key");
    expect(embedding).toHaveLength(768);
  });

  test("trims GEMINI_API_KEY from the environment before creating the client", async () => {
    let receivedApiKey: string | undefined;
    resetGeminiClientFactory = setGeminiClientFactoryForTests((apiKey) => {
      receivedApiKey = apiKey;

      return {
        models: {
          embedContent: async () => ({
            embeddings: [{ values: createEmbedding(4) }],
          }),
        },
      };
    });

    process.env.GEMINI_API_KEY = "  padded-env-key  ";

    const embedding = await generateGeminiEmbedding("Needs trimmed env key");

    expect(receivedApiKey).toBe("padded-env-key");
    expect(embedding).toHaveLength(768);
  });

  test("trims an explicitly provided Gemini API key before creating the client", async () => {
    let receivedApiKey: string | undefined;
    resetGeminiClientFactory = setGeminiClientFactoryForTests((apiKey) => {
      receivedApiKey = apiKey;

      return {
        models: {
          embedContent: async () => ({
            embeddings: [{ values: createEmbedding(5) }],
          }),
        },
      };
    });

    const embedding = await generateGeminiEmbedding("Needs trimmed explicit key", {
      apiKey: "  padded-explicit-key  ",
    });

    expect(receivedApiKey).toBe("padded-explicit-key");
    expect(embedding).toHaveLength(768);
  });
});
