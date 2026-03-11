import { GoogleGenAI } from '@google/genai';

export interface ChatResult {
  text: string;
  provider: "deepseek" | "gemini" | "groq";
}

export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_EMBEDDING_DIMENSIONS = 768;

export interface GeminiEmbeddingOptions {
  apiKey?: string;
  model?: string;
  outputDimensionality?: number;
}

export interface GeminiEmbeddingResponse {
  embeddings?: Array<
    | {
      values?: number[];
      embedding?: {
        values?: number[];
      };
    }
    | null
  >;
  embedding?: {
    values?: number[];
  } | null;
}

type GeminiEmbeddingValueContainer =
  | {
    values?: number[];
    embedding?: {
      values?: number[];
    };
  }
  | null
  | undefined;

export interface GeminiEmbeddingClient {
  models: {
    embedContent: (params: {
      model: string;
      content?: string;
      contents?: string[];
      config?: {
        outputDimensionality?: number;
      };
    }) => Promise<GeminiEmbeddingResponse>;
  };
}

export type GeminiClientFactory = (apiKey: string) => GeminiEmbeddingClient;

const DEFAULT_OUTPUT_DIMENSIONALITY = GEMINI_EMBEDDING_DIMENSIONS;

const defaultGeminiClientFactory: GeminiClientFactory = (apiKey) =>
  new GoogleGenAI({ apiKey }) as GeminiEmbeddingClient;

let geminiClientFactory: GeminiClientFactory = defaultGeminiClientFactory;

const resolveGeminiApiKey = (apiKey?: string): string => {
  if (apiKey) {
    return apiKey;
  }

  const runtimeApiKey = process.env.GEMINI_API_KEY;
  if (typeof runtimeApiKey === "string" && runtimeApiKey.trim().length > 0) {
    return runtimeApiKey;
  }

  throw new Error("Missing required environment variable: GEMINI_API_KEY");
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const extractEmbeddingValues = (
  embedding: GeminiEmbeddingValueContainer,
): number[] | null => {
  if (!embedding) {
    return null;
  }

  if ("values" in embedding && Array.isArray(embedding.values) && embedding.values.every(isFiniteNumber)) {
    return embedding.values;
  }

  if (
    "embedding" in embedding &&
    embedding.embedding &&
    Array.isArray(embedding.embedding.values) &&
    embedding.embedding.values.every(isFiniteNumber)
  ) {
    return embedding.embedding.values;
  }

  return null;
};

const isEmbeddingVector = (embedding: number[] | null): embedding is number[] =>
  Array.isArray(embedding);

const assertEmbeddingDimensions = (
  embedding: number[],
  outputDimensionality: number,
): number[] => {
  if (embedding.length !== outputDimensionality) {
    throw new Error(
      `Gemini embedding length mismatch: expected ${outputDimensionality}, received ${embedding.length}`,
    );
  }

  return embedding;
};

const assertValidOutputDimensionality = (
  outputDimensionality: number,
): number => {
  if (!Number.isInteger(outputDimensionality) || outputDimensionality <= 0) {
    throw new Error(
      `Gemini embeddings require outputDimensionality to be a positive integer, received ${String(outputDimensionality)}`,
    );
  }

  return outputDimensionality;
};

export const setGeminiClientFactoryForTests = (factory: GeminiClientFactory): (() => void) => {
  const previousFactory = geminiClientFactory;
  geminiClientFactory = factory;

  return () => {
    geminiClientFactory = previousFactory;
  };
};

export const generateGeminiEmbeddings = async (
  texts: string[],
  options: GeminiEmbeddingOptions = {},
): Promise<number[][]> => {
  if (texts.length === 0) {
    throw new Error("At least one text is required to generate Gemini embeddings");
  }

  if (texts.some((text) => text.trim().length === 0)) {
    throw new Error("Gemini embeddings require non-empty text input");
  }

  const model = options.model ?? GEMINI_EMBEDDING_MODEL;
  const effectiveOutputDimensionality = assertValidOutputDimensionality(
    options.outputDimensionality ?? DEFAULT_OUTPUT_DIMENSIONALITY,
  );
  const client = geminiClientFactory(resolveGeminiApiKey(options.apiKey));
  const response = await client.models.embedContent({
    model,
    contents: texts,
    config: {
      outputDimensionality: effectiveOutputDimensionality,
    },
  });

  const embeddings = Array.isArray(response.embeddings)
    ? response.embeddings.map((embedding) => extractEmbeddingValues(embedding))
    : [extractEmbeddingValues(response.embedding)];

  if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding === null)) {
    throw new Error("Gemini embedding response did not include one embedding per input text");
  }

  return embeddings
    .filter(isEmbeddingVector)
    .map((embedding) => assertEmbeddingDimensions(embedding, effectiveOutputDimensionality));
};

export const generateGeminiEmbedding = async (
  text: string,
  options: GeminiEmbeddingOptions = {},
): Promise<number[]> => {
  const [embedding] = await generateGeminiEmbeddings([text], options);
  return embedding;
};

export const mockChat = async (input: string): Promise<ChatResult> => {
  return {
    text: `echo:${input}`,
    provider: "deepseek"
  };
};
