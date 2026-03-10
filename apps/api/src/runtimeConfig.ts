import { env } from '@cs/config';

export interface ApiRuntimeConfig {
  apiKey?: string;
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

export const createApiRuntimeConfig = (
  config: Partial<ApiRuntimeConfig> = {}
): ApiRuntimeConfig => ({
  apiKey: config.apiKey ?? env.API_KEY,
  corsOrigins: config.corsOrigins ?? env.API_CORS_ORIGINS,
  rateLimitMax: config.rateLimitMax ?? env.API_RATE_LIMIT_MAX,
  rateLimitWindowMs: config.rateLimitWindowMs ?? env.API_RATE_LIMIT_WINDOW_MS
});
