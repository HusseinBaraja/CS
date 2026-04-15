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

export interface GeminiChatPart {
  text?: string;
  functionCall?: unknown;
}

export interface GeminiChatContent {
  parts?: GeminiChatPart[];
  role?: string;
}

export interface GeminiGenerateContentConfig {
  abortSignal?: AbortSignal;
  systemInstruction?: string | GeminiChatContent;
  temperature?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

export interface GeminiGenerateContentResponse {
  modelVersion?: string;
  responseId?: string;
  text?: string;
  functionCalls?: unknown[];
  candidates?: Array<
    | {
      content?: GeminiChatContent;
      finishReason?: string;
    }
    | null
  >;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface GeminiClient {
  models: {
    embedContent: (params: {
      model: string;
      content?: string;
      contents?: string[];
      config?: {
        outputDimensionality?: number;
      };
    }) => Promise<GeminiEmbeddingResponse>;
    generateContent?: (params: {
      model: string;
      contents: GeminiChatContent[];
      config?: Omit<GeminiGenerateContentConfig, "abortSignal">;
      abortSignal?: AbortSignal;
    }) => Promise<GeminiGenerateContentResponse>;
  };
}

export type GeminiEmbeddingClient = Pick<GeminiClient, "models">;
export type GeminiChatClient = Pick<GeminiClient, "models">;

export type GeminiClientFactory = (apiKey: string) => GeminiClient;
