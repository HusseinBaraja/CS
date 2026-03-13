import type { ChatProviderError } from './errors';
import type { ChatProviderRuntimeConfig } from './runtimeConfig';

export type ChatProviderName = "deepseek" | "gemini" | "groq";
export type ChatMessageRole = "system" | "user" | "assistant";
export type ChatTextPart = { type: "text"; text: string };
export type ChatMessageInput = {
  role: ChatMessageRole;
  content: string | ChatTextPart[];
  name?: string;
};
export type NormalizedChatMessage = {
  role: ChatMessageRole;
  content: ChatTextPart[];
  name?: string;
};
export type ChatRequest = {
  messages: ChatMessageInput[];
  temperature?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
};
export type NormalizedChatRequest = {
  messages: NormalizedChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
};
export type ChatFinishReason = "stop" | "max_tokens" | "blocked" | "tool_calls" | "unknown";
export type ChatTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
export type ChatResponse = {
  provider: ChatProviderName;
  model?: string;
  text: string;
  finishReason: ChatFinishReason;
  usage?: ChatTokenUsage;
  responseId?: string;
};
export type ChatProviderHealth = {
  provider: ChatProviderName;
  ok: boolean;
  model?: string;
  latencyMs?: number;
  error?: ChatProviderError;
};
export type ChatCallOptions = { signal?: AbortSignal; timeoutMs?: number; maxRetries?: number };
export type ChatProviderAdapter = {
  provider: ChatProviderName;
  chat(
    request: NormalizedChatRequest,
    config: ChatProviderRuntimeConfig,
    options?: ChatCallOptions,
  ): Promise<ChatResponse>;
  healthCheck(
    config: ChatProviderRuntimeConfig,
    options?: ChatCallOptions,
  ): Promise<ChatProviderHealth>;
};
