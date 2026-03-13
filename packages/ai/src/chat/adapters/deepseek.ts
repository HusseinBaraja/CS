import type { ChatCallOptions, ChatProviderAdapter, ChatResponse, NormalizedChatRequest } from '../contracts';
import type { ResolvedProviderConfig } from './shared';
import type { ChatProviderRuntimeConfig } from '../runtimeConfig';
import { createDeepSeekClient } from './clients/deepseekClientFactory';
import {
  assertProviderConfig,
  classifyOpenAICompatibleError,
  createHealthCheckRequest,
  createHealthCheckResult,
  DEFAULT_CHAT_HEALTHCHECK_TIMEOUT_MS,
  DEFAULT_CHAT_REQUEST_TIMEOUT_MS,
  DEFAULT_DEEPSEEK_BASE_URL,
  normalizeOpenAICompatibleResponse,
  runWithRetries,
  toHealthCheckError,
  toOpenAICompatibleMessages,
} from './shared';

const PROVIDER = "deepseek" as const;

const runChatRequest = async (
  request: NormalizedChatRequest,
  config: ResolvedProviderConfig,
  options: ChatCallOptions | undefined,
  allowEmptyText = false,
): Promise<ChatResponse> => {
  const client = createDeepSeekClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL,
  });

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

export const deepseekChatProviderAdapter: ChatProviderAdapter = {
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
