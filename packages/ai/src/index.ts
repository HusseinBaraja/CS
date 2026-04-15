export {
  GEMINI_EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  generateGeminiEmbedding,
  generateGeminiEmbeddings,
} from "./embeddings";
export { setGeminiClientFactoryForTests } from "./testUtils";

export { getChatProviderAdapter, CHAT_PROVIDER_NAMES, } from "./chat/adapters";
export {
  createChatRuntimeConfig,
  createRetrievalRewriteRuntimeConfig,
} from "./chat/runtimeConfig";
export { ChatProviderError } from "./chat/errors";
export {
  ChatProviderChainError,
  createChatProviderManager,
  createRetrievalRewriteChatProviderManager,
} from "./chat/manager";
export { detectChatLanguage, resolveChatResponseLanguage } from "./chat/language";
export { buildGroundedChatPrompt } from "./chat/prompt";
export { DEFAULT_ALLOWED_ACTIONS, getAllowedActions } from "./chat/actions";
export { parseAssistantStructuredOutput } from "./chat/output";

export type {
  ChatCallOptions,
  ChatFinishReason,
  ChatJsonSchema,
  ChatMessageInput,
  ChatMessageRole,
  ChatProviderAdapter,
  ChatProviderHealth,
  ChatProviderName,
  ChatRequest,
  ChatResponseFormat,
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
  PromptRetrievalMode,
  PromptRetrievalProvenance,
  PromptRetrievalQuerySource,
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
  CreateRetrievalRewriteChatProviderManagerOptions,
} from "./chat/manager";
export type {
  ChatProviderRuntimeConfig,
  ChatRuntimeConfig,
  RetrievalRewriteRuntimeConfig,
} from "./chat/runtimeConfig";
