import { env } from '@cs/config';

export interface ApiRuntimeConfig {
  apiKey?: string;
  corsOrigins: string[];
  trustedProxyIps: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
  trustProxyHops: number;
}

export const createApiRuntimeConfig = (
  config: Partial<ApiRuntimeConfig> = {}
): ApiRuntimeConfig => ({
  apiKey: config.apiKey ?? env.API_KEY,
  corsOrigins: config.corsOrigins ?? env.API_CORS_ORIGINS,
  trustedProxyIps: config.trustedProxyIps ?? env.API_TRUSTED_PROXY_IPS,
  rateLimitMax: config.rateLimitMax ?? env.API_RATE_LIMIT_MAX,
  rateLimitWindowMs: config.rateLimitWindowMs ?? env.API_RATE_LIMIT_WINDOW_MS,
  trustProxyHops: config.trustProxyHops ?? env.API_TRUST_PROXY_HOPS
});
