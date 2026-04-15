import { assertNonNegativeInteger, env, normalizeOptionalSecret } from '@cs/config';
import type { ChatProviderName } from './contracts';

export type ChatProviderRuntimeConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type ChatRuntimeConfig = {
  providerOrder: ChatProviderName[];
  requestTimeoutMs: number;
  healthcheckTimeoutMs: number;
  maxRetriesPerProvider: number;
  providers: {
    deepseek: ChatProviderRuntimeConfig;
    gemini: ChatProviderRuntimeConfig;
    groq: ChatProviderRuntimeConfig;
  };
};

export type RetrievalRewriteRuntimeConfig = ChatRuntimeConfig;

const CHAT_PROVIDER_NAMES = ["deepseek", "gemini", "groq"] as const;
const CHAT_PROVIDER_NAME_SET = new Set<ChatProviderName>(CHAT_PROVIDER_NAMES);

const assertPositiveInteger = (propertyName: string, value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid ${propertyName}: expected a positive integer, received ${String(value)}`,
    );
  }

  return value;
};

const assertValidProviderOrder = (
  providerOrder: readonly string[],
): ChatProviderName[] => {
  if (providerOrder.length === 0) {
    throw new Error("Invalid ChatRuntimeConfig.providerOrder: expected at least one provider");
  }

  const seenProviders = new Set<ChatProviderName>();

  return providerOrder.map((provider) => {
    if (!CHAT_PROVIDER_NAME_SET.has(provider as ChatProviderName)) {
      throw new Error(
        `Invalid ChatRuntimeConfig.providerOrder: unknown provider ${provider}`,
      );
    }

    const chatProvider = provider as ChatProviderName;
    if (seenProviders.has(chatProvider)) {
      throw new Error(
        `Invalid ChatRuntimeConfig.providerOrder: duplicate provider ${provider}`,
      );
    }

    seenProviders.add(chatProvider);
    return chatProvider;
  });
};

const assertValidBaseUrl = (
  propertyName: string,
  baseUrl: string | undefined,
): string | undefined => {
  const normalizedBaseUrl = normalizeOptionalSecret(baseUrl);
  if (normalizedBaseUrl === undefined) {
    return undefined;
  }

  try {
    return new URL(normalizedBaseUrl).toString();
  } catch {
    throw new Error(
      `Invalid ${propertyName}: expected a valid URL, received ${String(baseUrl)}`,
    );
  }
};

const hasOwn = <TObject extends object, TKey extends PropertyKey>(
  value: TObject,
  key: TKey,
): value is TObject & Record<TKey, unknown> =>
  Object.prototype.hasOwnProperty.call(value, key);

const getProviderOverride = (
  overrides: Partial<ChatRuntimeConfig>,
  provider: ChatProviderName,
): Partial<ChatProviderRuntimeConfig> =>
  overrides.providers?.[provider] ?? {};

const createEnvProviderConfig = (): ChatRuntimeConfig["providers"] => ({
  deepseek: {
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_CHAT_MODEL,
    baseUrl: env.DEEPSEEK_BASE_URL,
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_CHAT_MODEL,
    baseUrl: undefined,
  },
  groq: {
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_CHAT_MODEL,
    baseUrl: undefined,
  },
});

const resolveProviderConfig = (
  overrides: Partial<ChatRuntimeConfig>,
  provider: ChatProviderName,
): ChatProviderRuntimeConfig => {
  const providerOverrides = getProviderOverride(overrides, provider);
  const hasApiKeyOverride = hasOwn(providerOverrides, "apiKey");
  const hasModelOverride = hasOwn(providerOverrides, "model");
  const hasBaseUrlOverride = hasOwn(providerOverrides, "baseUrl");
  const providerEnvConfig = createEnvProviderConfig()[provider];

  return {
    apiKey: normalizeOptionalSecret(
      hasApiKeyOverride ? providerOverrides.apiKey as string | undefined : providerEnvConfig.apiKey,
    ),
    model: normalizeOptionalSecret(
      hasModelOverride ? providerOverrides.model as string | undefined : providerEnvConfig.model,
    ),
    baseUrl: assertValidBaseUrl(
      `ChatRuntimeConfig.providers.${provider}.baseUrl`,
      hasBaseUrlOverride
        ? providerOverrides.baseUrl as string | undefined
        : providerEnvConfig.baseUrl,
    ),
  };
};

export const createChatRuntimeConfig = (
  overrides: Partial<ChatRuntimeConfig> = {},
): ChatRuntimeConfig => ({
  providerOrder: assertValidProviderOrder(overrides.providerOrder ?? env.AI_PROVIDER_ORDER),
  requestTimeoutMs: assertPositiveInteger(
    "ChatRuntimeConfig.requestTimeoutMs",
    overrides.requestTimeoutMs ?? env.AI_REQUEST_TIMEOUT_MS,
  ),
  healthcheckTimeoutMs: assertPositiveInteger(
    "ChatRuntimeConfig.healthcheckTimeoutMs",
    overrides.healthcheckTimeoutMs ?? env.AI_HEALTHCHECK_TIMEOUT_MS,
  ),
  maxRetriesPerProvider: assertNonNegativeInteger(
    "ChatRuntimeConfig.maxRetriesPerProvider",
    overrides.maxRetriesPerProvider ?? env.AI_MAX_RETRIES_PER_PROVIDER,
  ),
  providers: {
    deepseek: resolveProviderConfig(overrides, "deepseek"),
    gemini: resolveProviderConfig(overrides, "gemini"),
    groq: resolveProviderConfig(overrides, "groq"),
  },
});

const getRetrievalRewriteProviderModelOverride = (
  provider: ChatProviderName,
): string | undefined => {
  switch (provider) {
    case "deepseek":
      return env.DEEPSEEK_RETRIEVAL_REWRITE_MODEL;
    case "gemini":
      return env.GEMINI_RETRIEVAL_REWRITE_MODEL;
    case "groq":
      return env.GROQ_RETRIEVAL_REWRITE_MODEL;
  }
};

const resolveRetrievalRewriteProviderConfig = (
  overrides: Partial<RetrievalRewriteRuntimeConfig>,
  baseConfig: ChatRuntimeConfig,
  provider: ChatProviderName,
): ChatProviderRuntimeConfig => {
  const providerOverrides = getProviderOverride(overrides, provider);
  const hasApiKeyOverride = hasOwn(providerOverrides, "apiKey");
  const hasModelOverride = hasOwn(providerOverrides, "model");
  const hasBaseUrlOverride = hasOwn(providerOverrides, "baseUrl");
  const baseProviderConfig = baseConfig.providers[provider];

  return {
    apiKey: normalizeOptionalSecret(
      hasApiKeyOverride ? providerOverrides.apiKey as string | undefined : baseProviderConfig.apiKey,
    ),
    model: normalizeOptionalSecret(
      hasModelOverride
        ? providerOverrides.model as string | undefined
        : getRetrievalRewriteProviderModelOverride(provider) ?? baseProviderConfig.model,
    ),
    baseUrl: assertValidBaseUrl(
      `RetrievalRewriteRuntimeConfig.providers.${provider}.baseUrl`,
      hasBaseUrlOverride
        ? providerOverrides.baseUrl as string | undefined
        : baseProviderConfig.baseUrl,
    ),
  };
};

export const createRetrievalRewriteRuntimeConfig = (
  overrides: Partial<RetrievalRewriteRuntimeConfig> = {},
  baseConfig: ChatRuntimeConfig = createChatRuntimeConfig(),
): RetrievalRewriteRuntimeConfig => ({
  providerOrder: assertValidProviderOrder(
    overrides.providerOrder
      ?? env.AI_RETRIEVAL_REWRITE_PROVIDER_ORDER
      ?? baseConfig.providerOrder,
  ),
  requestTimeoutMs: assertPositiveInteger(
    "RetrievalRewriteRuntimeConfig.requestTimeoutMs",
    overrides.requestTimeoutMs
      ?? env.AI_RETRIEVAL_REWRITE_TIMEOUT_MS
      ?? baseConfig.requestTimeoutMs,
  ),
  healthcheckTimeoutMs: assertPositiveInteger(
    "RetrievalRewriteRuntimeConfig.healthcheckTimeoutMs",
    overrides.healthcheckTimeoutMs ?? baseConfig.healthcheckTimeoutMs,
  ),
  maxRetriesPerProvider: assertNonNegativeInteger(
    "RetrievalRewriteRuntimeConfig.maxRetriesPerProvider",
    overrides.maxRetriesPerProvider ?? baseConfig.maxRetriesPerProvider,
  ),
  providers: {
    deepseek: resolveRetrievalRewriteProviderConfig(overrides, baseConfig, "deepseek"),
    gemini: resolveRetrievalRewriteProviderConfig(overrides, baseConfig, "gemini"),
    groq: resolveRetrievalRewriteProviderConfig(overrides, baseConfig, "groq"),
  },
});
