export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_EMBEDDING_DIMENSIONS = 768;

export type {
  GeminiEmbeddingValueContainer,
} from "../gemini/types";

export interface GeminiEmbeddingOptions {
  apiKey?: string;
  model?: string;
  outputDimensionality?: number;
}
