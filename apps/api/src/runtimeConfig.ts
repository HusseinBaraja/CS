import {
  assertNonNegativeInteger,
  env,
  normalizeCorsOrigins,
  normalizeOptionalSecret
} from '@cs/config';

export interface ApiRuntimeConfig {
  apiKey?: string;
  corsOrigins: string[];
  trustedProxyIps: string[];
  rateLimitMax: number;
  rateLimitMaxEntries: number;
  rateLimitWindowMs: number;
  trustProxyHops: number;
}

const assertPositiveInteger = (propertyName: string, value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid ${propertyName}: expected a positive integer, received ${String(value)}`,
    );
  }

  return value;
};

export const createApiRuntimeConfig = (
  config: Partial<ApiRuntimeConfig> = {}
): ApiRuntimeConfig => {
  const hasRuntimeOverride = <TKey extends keyof ApiRuntimeConfig>(key: TKey): boolean =>
    Object.prototype.hasOwnProperty.call(config, key);
  const rateLimitMax = assertPositiveInteger(
    "ApiRuntimeConfig.rateLimitMax",
    config.rateLimitMax ?? env.API_RATE_LIMIT_MAX,
  );
  const rateLimitMaxEntries = assertPositiveInteger(
    "ApiRuntimeConfig.rateLimitMaxEntries",
    config.rateLimitMaxEntries ?? env.API_RATE_LIMIT_MAX_ENTRIES,
  );
  const rateLimitWindowMs = assertPositiveInteger(
    "ApiRuntimeConfig.rateLimitWindowMs",
    config.rateLimitWindowMs ?? env.API_RATE_LIMIT_WINDOW_MS,
  );

  return {
    apiKey: normalizeOptionalSecret(hasRuntimeOverride("apiKey") ? config.apiKey : env.API_KEY),
    corsOrigins: normalizeCorsOrigins(config.corsOrigins ?? env.API_CORS_ORIGINS),
    trustedProxyIps: config.trustedProxyIps ?? env.API_TRUSTED_PROXY_IPS,
    rateLimitMax,
    rateLimitMaxEntries,
    rateLimitWindowMs,
    trustProxyHops: assertNonNegativeInteger(
      "ApiRuntimeConfig.trustProxyHops",
      config.trustProxyHops ?? env.API_TRUST_PROXY_HOPS,
    )
  };
};
