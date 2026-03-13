import type {
  ChatFinishReason,
  ChatProviderHealth,
  ChatProviderName,
  ChatResponse,
  NormalizedChatMessage,
  NormalizedChatRequest,
} from '../contracts';
import { ChatProviderError, createChatProviderError } from '../errors';
import type { ChatProviderRuntimeConfig } from '../runtimeConfig';
import type { GeminiGenerateContentResponse } from '../../gemini/types';

export const DEFAULT_CHAT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_CHAT_HEALTHCHECK_TIMEOUT_MS = 5_000;
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export type ResolvedProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
};

export type OpenAICompatibleChatCompletion = {
  id?: string;
  model?: string;
  choices?: Array<
    | {
      finish_reason?: string | null;
      message?: {
        content?: string | Array<{ text?: string | null } | null> | null;
        tool_calls?: unknown[] | null;
        function_call?: unknown | null;
      } | null;
    }
    | null
  >;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
};

export interface OpenAICompatibleChatClient {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: OpenAICompatibleMessage[];
        temperature?: number;
        max_tokens?: number;
        stop?: string[];
        stream?: false;
      }, options?: { signal?: AbortSignal }) => Promise<OpenAICompatibleChatCompletion>;
    };
  };
}

const TIMEOUT_ERROR_PATTERN = /\btimeout\b|timed out|ETIMEDOUT/i;
const NETWORK_ERROR_PATTERN = /\bECONNRESET\b|\bECONNREFUSED\b|\bENOTFOUND\b|\bEAI_AGAIN\b|\bnetwork\b/i;

const asAbortError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error("The operation was aborted");

const getErrorName = (error: unknown): string =>
  error instanceof Error && error.name.trim().length > 0
    ? error.name
    : typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
      ? error.name
      : "Error";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "Provider request failed";

const getErrorStatus = (error: unknown): number | undefined =>
  typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;

const getErrorCause = (error: unknown): Error | undefined =>
  error instanceof Error ? error : undefined;

const isRetryableStatus = (status: number | undefined): boolean =>
  status === 429 || (status !== undefined && status >= 500);

const createProviderError = (
  provider: ChatProviderName,
  kind: Parameters<typeof createChatProviderError>[0]["kind"],
  error: unknown,
  model?: string,
  overrides: Partial<Pick<Parameters<typeof createChatProviderError>[0], "message" | "disposition" | "retryable">> = {},
): ChatProviderError =>
  createChatProviderError({
    provider,
    kind,
    message: overrides.message ?? getErrorMessage(error),
    cause: getErrorCause(error),
    statusCode: getErrorStatus(error),
    model,
    ...(overrides.disposition !== undefined ? { disposition: overrides.disposition } : {}),
    ...(overrides.retryable !== undefined ? { retryable: overrides.retryable } : {}),
  });

const createAttemptSignal = (
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly cleanup: () => void;
} => {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`Operation timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      if (parentSignal) {
        parentSignal.removeEventListener("abort", abortFromParent);
      }
    },
  };
};

export const assertProviderConfig = (
  provider: ChatProviderName,
  config: ChatProviderRuntimeConfig,
): ResolvedProviderConfig => {
  if (!config.apiKey) {
    throw createChatProviderError({
      provider,
      kind: "configuration",
      message: `Missing API key for ${provider}`,
      retryable: false,
    });
  }

  if (!config.model) {
    throw createChatProviderError({
      provider,
      kind: "configuration",
      message: `Missing model for ${provider}`,
      retryable: false,
    });
  }

  return {
    apiKey: config.apiKey,
    model: config.model,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
  };
};

export const joinTextParts = (message: Pick<NormalizedChatMessage, "content">): string =>
  message.content.map((part) => part.text).join("\n");

export const toOpenAICompatibleMessages = (
  messages: NormalizedChatMessage[],
): OpenAICompatibleMessage[] =>
  messages.map((message) => ({
    role: message.role,
    content: joinTextParts(message),
    ...(message.name !== undefined ? { name: message.name } : {}),
  }));

export const normalizeOpenAICompatibleFinishReason = (
  finishReason: string | null | undefined,
): ChatFinishReason => {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "blocked";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    default:
      return "unknown";
  }
};

export const normalizeGeminiFinishReason = (
  finishReason: string | undefined,
): ChatFinishReason => {
  switch (finishReason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "max_tokens";
    case "MALFORMED_FUNCTION_CALL":
    case "UNEXPECTED_TOOL_CALL":
      return "tool_calls";
    case "SAFETY":
    case "RECITATION":
    case "LANGUAGE":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
    case "IMAGE_SAFETY":
    case "IMAGE_PROHIBITED_CONTENT":
      return "blocked";
    default:
      return "unknown";
  }
};

const extractOpenAICompatibleText = (
  response: OpenAICompatibleChatCompletion,
): string => {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => part?.text ?? [])
    .join("");
};

const extractGeminiText = (
  response: GeminiGenerateContentResponse,
): string => {
  if (typeof response.text === "string") {
    return response.text;
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .flatMap((part) => typeof part.text === "string" ? [part.text] : [])
    .join("");
};

const assertResponseText = (
  provider: ChatProviderName,
  finishReason: ChatFinishReason,
  text: string,
  model: string | undefined,
): void => {
  if (text.length > 0 || finishReason === "blocked" || finishReason === "tool_calls") {
    return;
  }

  throw createChatProviderError({
    provider,
    kind: "response_format",
    message: `${provider} returned a response without usable text`,
    retryable: false,
    model,
  });
};

export const normalizeOpenAICompatibleResponse = (
  provider: ChatProviderName,
  response: OpenAICompatibleChatCompletion,
  fallbackModel: string,
  allowEmptyText = false,
): ChatResponse => {
  const finishReason = normalizeOpenAICompatibleFinishReason(
    response.choices?.[0]?.finish_reason,
  );
  const text = extractOpenAICompatibleText(response);
  const model = response.model ?? fallbackModel;

  if (!allowEmptyText) {
    assertResponseText(provider, finishReason, text, model);
  }

  return {
    provider,
    model,
    text,
    finishReason,
    usage: response.usage
      ? {
        ...(response.usage.prompt_tokens !== undefined
          ? { inputTokens: response.usage.prompt_tokens }
          : {}),
        ...(response.usage.completion_tokens !== undefined
          ? { outputTokens: response.usage.completion_tokens }
          : {}),
        ...(response.usage.total_tokens !== undefined
          ? { totalTokens: response.usage.total_tokens }
          : {}),
      }
      : undefined,
    responseId: response.id,
  };
};

export const normalizeGeminiResponse = (
  provider: ChatProviderName,
  response: GeminiGenerateContentResponse,
  fallbackModel: string,
  allowEmptyText = false,
): ChatResponse => {
  const finishReason = normalizeGeminiFinishReason(
    response.candidates?.[0]?.finishReason,
  );
  const text = extractGeminiText(response);
  const model = response.modelVersion ?? fallbackModel;

  if (!allowEmptyText) {
    assertResponseText(provider, finishReason, text, model);
  }

  return {
    provider,
    model,
    text,
    finishReason,
    usage: response.usageMetadata
      ? {
        ...(response.usageMetadata.promptTokenCount !== undefined
          ? { inputTokens: response.usageMetadata.promptTokenCount }
          : {}),
        ...(response.usageMetadata.candidatesTokenCount !== undefined
          ? { outputTokens: response.usageMetadata.candidatesTokenCount }
          : {}),
        ...(response.usageMetadata.totalTokenCount !== undefined
          ? { totalTokens: response.usageMetadata.totalTokenCount }
          : {}),
      }
      : undefined,
    responseId: response.responseId,
  };
};

export const classifyOpenAICompatibleError = (
  provider: ChatProviderName,
  error: unknown,
  model?: string,
): ChatProviderError => {
  if (error instanceof ChatProviderError) {
    return error;
  }

  const statusCode = getErrorStatus(error);
  const errorName = getErrorName(error);
  const errorMessage = getErrorMessage(error);

  if (TIMEOUT_ERROR_PATTERN.test(errorName) || TIMEOUT_ERROR_PATTERN.test(errorMessage)) {
    return createProviderError(provider, "timeout", error, model);
  }

  if (statusCode === 401 || statusCode === 403 || /authentication|permission/i.test(errorName)) {
    return createProviderError(provider, "authentication", error, model);
  }

  if (statusCode === 429 || /ratelimit/i.test(errorName)) {
    return createProviderError(provider, "rate_limit", error, model);
  }

  if (
    statusCode === 400 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 422 ||
    /badrequest|unprocessable|notfound|conflict/i.test(errorName)
  ) {
    return createProviderError(provider, "invalid_request", error, model);
  }

  if (
    isRetryableStatus(statusCode) ||
    /apiconnection|internalserver/i.test(errorName) ||
    NETWORK_ERROR_PATTERN.test(errorMessage)
  ) {
    return createProviderError(provider, "unavailable", error, model);
  }

  return createProviderError(provider, "unknown", error, model);
};

export const classifyGeminiError = (
  provider: ChatProviderName,
  error: unknown,
  model?: string,
): ChatProviderError => {
  if (error instanceof ChatProviderError) {
    return error;
  }

  const statusCode = getErrorStatus(error);
  const errorName = getErrorName(error);
  const errorMessage = getErrorMessage(error);

  if (TIMEOUT_ERROR_PATTERN.test(errorName) || TIMEOUT_ERROR_PATTERN.test(errorMessage)) {
    return createProviderError(provider, "timeout", error, model);
  }

  if (statusCode === 401 || statusCode === 403) {
    return createProviderError(provider, "authentication", error, model);
  }

  if (statusCode === 429) {
    return createProviderError(provider, "rate_limit", error, model);
  }

  if (statusCode === 400 || statusCode === 404 || statusCode === 409 || statusCode === 422) {
    return createProviderError(provider, "invalid_request", error, model);
  }

  if (isRetryableStatus(statusCode) || NETWORK_ERROR_PATTERN.test(errorMessage)) {
    return createProviderError(provider, "unavailable", error, model);
  }

  return createProviderError(provider, "unknown", error, model);
};

export const runWithRetries = async <T>(
  provider: ChatProviderName,
  model: string,
  timeoutMs: number,
  maxRetries: number,
  signal: AbortSignal | undefined,
  classifyError: (error: unknown) => ChatProviderError,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (signal?.aborted) {
      throw asAbortError(signal.reason);
    }

    const attemptSignal = createAttemptSignal(signal, timeoutMs);
    try {
      return await operation(attemptSignal.signal);
    } catch (error) {
      if (signal?.aborted) {
        throw asAbortError(signal.reason ?? error);
      }

      const classifiedError = attemptSignal.didTimeout()
        ? createChatProviderError({
          provider,
          kind: "timeout",
          message: `${provider} request timed out after ${timeoutMs}ms`,
          cause: getErrorCause(error),
          model,
        })
        : classifyError(error);

      if (!classifiedError.retryable || attempt >= maxRetries) {
        throw classifiedError;
      }
    } finally {
      attemptSignal.cleanup();
    }
  }

  throw createChatProviderError({
    provider,
    kind: "unknown",
    message: `${provider} request failed without a terminal result`,
    retryable: false,
    model,
  });
};

export const createHealthCheckRequest = (): NormalizedChatRequest => ({
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "ping" }],
    },
  ],
  temperature: 0,
  maxOutputTokens: 1,
});

export const toHealthCheckError = (
  provider: ChatProviderName,
  error: unknown,
  model?: string,
): ChatProviderError =>
  error instanceof ChatProviderError
    ? error
    : createProviderError(provider, "unknown", error, model, {
      disposition: "do_not_retry",
      retryable: false,
    });

export const createHealthCheckResult = (
  provider: ChatProviderName,
  ok: boolean,
  model: string | undefined,
  startedAt: number,
  error?: ChatProviderError,
): ChatProviderHealth => ({
  provider,
  ok,
  ...(model !== undefined ? { model } : {}),
  latencyMs: Date.now() - startedAt,
  ...(error ? { error } : {}),
});
