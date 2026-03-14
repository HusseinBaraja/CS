import { createGeminiClient } from './geminiClientFactory';
import {
  GEMINI_EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  type GeminiEmbeddingOptions,
  type GeminiEmbeddingValueContainer,
} from './types';

const DEFAULT_OUTPUT_DIMENSIONALITY = GEMINI_EMBEDDING_DIMENSIONS;

const normalizeApiKey = (apiKey?: string): string | undefined => {
  if (typeof apiKey !== "string") {
    return undefined;
  }

  const trimmedApiKey = apiKey.trim();
  return trimmedApiKey.length > 0 ? trimmedApiKey : undefined;
};

const resolveGeminiApiKey = (apiKey?: string): string => {
  const explicitApiKey = normalizeApiKey(apiKey);
  if (explicitApiKey) {
    return explicitApiKey;
  }

  const runtimeApiKey = normalizeApiKey(process.env.GEMINI_API_KEY);
  if (runtimeApiKey) {
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
  const client = createGeminiClient(resolveGeminiApiKey(options.apiKey));
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
