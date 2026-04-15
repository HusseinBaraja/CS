import type { ChatCallOptions, ChatProviderAdapter, ChatResponse, NormalizedChatRequest } from '../contracts';
import type { ResolvedProviderConfig } from './shared';
import { createGroqClient } from './clients/groqClientFactory';
import { createChatProviderError } from '../errors';
import { getChatResponseFormatCapability } from '../structuredOutputCapabilities';
import {
  assertProviderConfig,
  classifyOpenAICompatibleError,
  createHealthCheckRequest,
  createHealthCheckResult,
  DEFAULT_CHAT_HEALTHCHECK_TIMEOUT_MS,
  DEFAULT_CHAT_REQUEST_TIMEOUT_MS,
  normalizeOpenAICompatibleResponse,
  runWithRetries,
  toHealthCheckError,
  toOpenAICompatibleMessages,
} from './shared';

const PROVIDER = "groq" as const;

const runChatRequest = async (
  request: NormalizedChatRequest,
  config: ResolvedProviderConfig,
  options: ChatCallOptions | undefined,
  allowEmptyText = false,
): Promise<ChatResponse> => {
  const client = createGroqClient({
    apiKey: config.apiKey,
  });

  if (getChatResponseFormatCapability(PROVIDER, request.responseFormat) === "unsupported") {
    throw createChatProviderError({
      provider: PROVIDER,
      kind: "response_format",
      message: `${PROVIDER} does not support structured responseFormat requests`,
      disposition: "failover_provider",
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
    (error) => classifyOpenAICompatibleError(PROVIDER, error, config.model),
    async (signal) => {
      const response = await client.chat.completions.create(
        {
          model: config.model,
          messages: toOpenAICompatibleMessages(request.messages),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxOutputTokens !== undefined ? { max_tokens: request.maxOutputTokens } : {}),
          ...(request.stopSequences !== undefined ? { stop: request.stopSequences } : {}),
          ...(request.responseFormat?.type === "json_schema"
            ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: request.responseFormat.jsonSchema.name,
                  schema: request.responseFormat.jsonSchema.schema,
                  ...(request.responseFormat.jsonSchema.strict !== undefined
                    ? { strict: request.responseFormat.jsonSchema.strict }
                    : {}),
                },
              },
            }
            : {}),
          stream: false,
        },
        { signal },
      );

      return normalizeOpenAICompatibleResponse(
        PROVIDER,
        response,
        config.model,
        allowEmptyText,
      );
    },
  );
};

export const groqChatProviderAdapter: ChatProviderAdapter = {
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
