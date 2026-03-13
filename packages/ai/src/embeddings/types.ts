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

export type GeminiEmbeddingValueContainer =
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
