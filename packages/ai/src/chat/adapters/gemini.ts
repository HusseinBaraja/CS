import type { ChatCallOptions, ChatProviderAdapter, ChatResponse, NormalizedChatRequest } from '@cs/ai';
import type { GeminiChatContent } from '../../gemini/types';
import type { ResolvedProviderConfig } from './shared';
import {
  assertProviderConfig,
  classifyGeminiError,
  createHealthCheckRequest,
  createHealthCheckResult,
  DEFAULT_CHAT_HEALTHCHECK_TIMEOUT_MS,
  DEFAULT_CHAT_REQUEST_TIMEOUT_MS,
  joinTextParts,
  normalizeGeminiResponse,
  runWithRetries,
  toHealthCheckError,
} from './shared';
import { createChatProviderError } from '../errors';
import { createGeminiClient } from '../../gemini/clientFactory';

const PROVIDER = "gemini" as const;

const toGeminiPayload = (
  request: NormalizedChatRequest,
): {
  contents: GeminiChatContent[];
  systemInstruction?: string;
} => {
  const systemInstructionParts: string[] = [];
  const contents: GeminiChatContent[] = [];

  for (const message of request.messages) {
    if (message.role === "system") {
      systemInstructionParts.push(joinTextParts(message));
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: message.content.map((part) => ({ text: part.text })),
    });
  }

  return {
    contents,
    ...(systemInstructionParts.length > 0
      ? { systemInstruction: systemInstructionParts.join("\n\n") }
      : {}),
  };
};

const assertGeminiRequest = (request: NormalizedChatRequest): ReturnType<typeof toGeminiPayload> => {
  const payload = toGeminiPayload(request);
  if (payload.contents.length === 0) {
    throw createChatProviderError({
      provider: PROVIDER,
      kind: "invalid_request",
      message: "Gemini requests require at least one non-system message",
      retryable: false,
    });
  }

  return payload;
};

const runChatRequest = async (
  request: NormalizedChatRequest,
  config: ResolvedProviderConfig,
  options: ChatCallOptions | undefined,
  allowEmptyText = false,
): Promise<ChatResponse> => {
  const client = createGeminiClient(config.apiKey);
  const models = client.models;
  const payload = assertGeminiRequest(request);

  if (!models.generateContent) {
    throw createChatProviderError({
      provider: PROVIDER,
      kind: "configuration",
      message: "Gemini chat client is not configured with generateContent",
      retryable: false,
      model: config.model,
    });
  }

  return runWithRetries(
    PROVIDER,
    config.model,
    options?.timeoutMs ?? DEFAULT_CHAT_REQUEST_TIMEOUT_MS,
    options?.maxRetries ?? 0,
    options?.signal,
    (error) => classifyGeminiError(PROVIDER, error, config.model),
    async (signal) => {
      const response = await models.generateContent!({
        model: config.model,
        contents: payload.contents,
        config: {
          ...(payload.systemInstruction !== undefined
            ? { systemInstruction: payload.systemInstruction }
            : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxOutputTokens !== undefined ? { maxOutputTokens: request.maxOutputTokens } : {}),
          ...(request.stopSequences !== undefined ? { stopSequences: request.stopSequences } : {}),
        },
        abortSignal: signal,
      });

      return normalizeGeminiResponse(PROVIDER, response, config.model, allowEmptyText);
    },
  );
};

export const geminiChatProviderAdapter: ChatProviderAdapter = {
  provider: PROVIDER,
  async chat(request, config, options) {
    const resolvedConfig = assertProviderConfig(PROVIDER, config);
    return runChatRequest(request, resolvedConfig, options);
  },
  async healthCheck(config, options) {
    const startedAt = Date.now();
    let model = config.model;

    try {
      const resolvedConfig = assertProviderConfig(PROVIDER, config);
      model = resolvedConfig.model;
      await runChatRequest(
        createHealthCheckRequest(),
        resolvedConfig,
        {
          ...options,
          timeoutMs: options?.timeoutMs ?? DEFAULT_CHAT_HEALTHCHECK_TIMEOUT_MS,
        },
        true,
      );
      return createHealthCheckResult(PROVIDER, true, model, startedAt);
    } catch (error) {
      return createHealthCheckResult(
        PROVIDER,
        false,
        model,
        startedAt,
        toHealthCheckError(PROVIDER, error, model),
      );
    }
  },
};
