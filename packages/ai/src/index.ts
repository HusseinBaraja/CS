export {
  GEMINI_EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  generateGeminiEmbedding,
  generateGeminiEmbeddings,
} from "./embeddings";

export { getChatProviderAdapter, CHAT_PROVIDER_NAMES, } from "./chat/adapters";
export { createChatRuntimeConfig } from "./chat/runtimeConfig";
export { ChatProviderError } from "./chat/errors";
export { ChatProviderChainError, createChatProviderManager } from "./chat/manager";
export { detectChatLanguage, resolveChatResponseLanguage } from "./chat/language";
export { buildGroundedChatPrompt } from "./chat/prompt";
export { parseAssistantStructuredOutput } from "./chat/output";

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
  ChatLanguage,
  DetectedChatLanguage,
  LanguageDetectionResult,
  LanguageResolutionOptions,
  ResolveChatResponseLanguageInput,
} from "./chat/language";
export type {
  AssistantActionType,
  AssistantStructuredOutput,
  BuildGroundedChatPromptInput,
  BuiltGroundedChatPrompt,
  GroundingContextBlock,
  ParseAssistantStructuredOutputOptions,
  PromptHistoryTurn,
} from "./chat/promptContracts";
export type {
  ChatProviderErrorDisposition,
  ChatProviderErrorKind,
} from "./chat/errors";
export type {
  ChatManagerCallOptions,
  ChatManagerLogContext,
  ChatManagerLogger,
  ChatProviderAdapterResolver,
  ChatProviderAttemptFailure,
  ChatProviderChainTerminalDisposition,
  ChatProviderManager,
  ChatProviderProbeOptions,
  CreateChatProviderManagerOptions,
} from "./chat/manager";
export type {
  ChatProviderRuntimeConfig,
  ChatRuntimeConfig,
} from "./chat/runtimeConfig";
