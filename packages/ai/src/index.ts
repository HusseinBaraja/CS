export {
  GEMINI_EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  generateGeminiEmbedding,
  generateGeminiEmbeddings,
} from "./embeddings";

export { createChatRuntimeConfig } from "./chat/runtimeConfig";
export { ChatProviderError } from "./chat/errors";

export type {
  ChatCallOptions,
  ChatFinishReason,
  ChatMessageInput,
  ChatMessageRole,
  ChatProviderAdapter,
  ChatProviderHealth,
  ChatProviderName,
  ChatRequest,
  ChatResponse,
  ChatTextPart,
  ChatTokenUsage,
  NormalizedChatMessage,
  NormalizedChatRequest,
} from "./chat/contracts";
export type {
  ChatProviderErrorDisposition,
  ChatProviderErrorKind,
} from "./chat/errors";
export type {
  ChatProviderRuntimeConfig,
  ChatRuntimeConfig,
} from "./chat/runtimeConfig";
