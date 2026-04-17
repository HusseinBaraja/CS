import type { ChatRequest } from './contracts';
import type { ChatRuntimeConfig } from './runtimeConfig';
import { getChatResponseFormatCapability } from './structuredOutputCapabilities';

export const getChatProviderOrderForRequest = (
  runtimeConfig: ChatRuntimeConfig,
  request: ChatRequest,
): ChatRuntimeConfig["providerOrder"] => {
  if (!request.responseFormat) {
    return runtimeConfig.providerOrder;
  }

  const compatibleProviders = runtimeConfig.providerOrder.filter((provider) =>
    getChatResponseFormatCapability(provider, request.responseFormat) !== "unsupported"
  );

  return compatibleProviders.length > 0 ? compatibleProviders : runtimeConfig.providerOrder;
};
