import type { ChatRequest } from './contracts';
import { createChatProviderError } from './errors';
import type { ChatRuntimeConfig } from './runtimeConfig';
import { getChatResponseFormatCapability } from './structuredOutputCapabilities';

export const getChatProviderOrderForRequest = (
  runtimeConfig: ChatRuntimeConfig,
  request: ChatRequest,
): ChatRuntimeConfig["providerOrder"] => {
  if (!request.responseFormat) {
    return runtimeConfig.providerOrder;
  }

  const responseFormat = request.responseFormat;
  const compatibleProviders: ChatRuntimeConfig["providerOrder"] = runtimeConfig.providerOrder.filter((provider) =>
    getChatResponseFormatCapability(provider, responseFormat) !== "unsupported"
  );
  if (compatibleProviders.length === 0) {
    throw createChatProviderError({
      provider: runtimeConfig.providerOrder[0],
      kind: "response_format",
      message:
        `No configured provider supports response format "${responseFormat.type}" in provider order: ${runtimeConfig.providerOrder.join(", ")}`,
      disposition: "do_not_retry",
      retryable: false,
    });
  }

  return compatibleProviders;
};
