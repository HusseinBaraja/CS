import type { StandardSchemaV1 } from '@t3-oss/env-core';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';
import { ConfigError, ERROR_CODES } from '@cs/shared';

type RuntimeEnv = Record<string, string | number | boolean | undefined>;

const OPTIONAL_EMPTY_ENV_KEYS = new Set(["API_KEY", "API_CORS_ORIGINS", "GEMINI_API_KEY"]);
const parseCsvEnv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const envSchema = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
  LOG_DIR: z.string().min(1).default("logs"),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  BACKUP_DIR: z.string().min(1).default("backups"),
  BACKUP_RETENTION_COUNT: z.coerce.number().int().positive().default(5),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  API_CORS_ORIGINS: z
    .string()
    .default("*")
    .transform((value) => {
      const origins = parseCsvEnv(value);
      return origins.length > 0 ? origins : ["*"];
    }),
  API_TRUSTED_PROXY_IPS: z.string().default("").transform(parseCsvEnv),
  API_TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  CONVEX_URL: z.string().min(1).url().optional()
};

type EnvSchemaKey = keyof typeof envSchema;

const normalizeRuntimeEnv = (
  runtimeEnv: RuntimeEnv
): RuntimeEnv =>
  Object.fromEntries(
    Object.entries(runtimeEnv).map(([key, value]) => [
      key,
      OPTIONAL_EMPTY_ENV_KEYS.has(key) && value === "" ? undefined : value
    ])
  );

const formatPathSegment = (
  segment: PropertyKey | StandardSchemaV1.PathSegment
): string =>
  typeof segment === "object" && segment !== null ? String(segment.key) : String(segment);

const formatIssuePath = (
  path: readonly (PropertyKey | StandardSchemaV1.PathSegment)[] | undefined
): string => {
  if (!path || path.length === 0) {
    return "environment";
  }

  return path.map(formatPathSegment).join(".");
};

const getIssueEnvKey = (issue: StandardSchemaV1.Issue): EnvSchemaKey | null => {
  const [firstSegment] = issue.path ?? [];
  const key = firstSegment ? formatPathSegment(firstSegment) : null;

  if (!key || !(key in envSchema)) {
    return null;
  }

  return key as EnvSchemaKey;
};

export const inferConfigErrorCode = (
  issues: readonly StandardSchemaV1.Issue[],
  runtimeEnv: RuntimeEnv
) => {
  const normalizedRuntimeEnv = normalizeRuntimeEnv(runtimeEnv);

  return issues.every((issue) => {
    const envKey = getIssueEnvKey(issue);
    return envKey !== null && normalizedRuntimeEnv[envKey] === undefined;
  })
    ? ERROR_CODES.CONFIG_MISSING
    : ERROR_CODES.CONFIG_INVALID;
};

const formatValidationIssues = (issues: readonly StandardSchemaV1.Issue[]): string =>
  issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

const toErrorContext = (issues: readonly StandardSchemaV1.Issue[]) => ({
  issues: issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    message: issue.message
  }))
});

export const createConfig = (
  runtimeEnv: RuntimeEnv = process.env
) => {
  const normalizedRuntimeEnv = normalizeRuntimeEnv(runtimeEnv);

  return createEnv({
    server: envSchema,
    runtimeEnv: normalizedRuntimeEnv,
    onValidationError: (issues) => {
      throw new ConfigError(formatValidationIssues(issues), {
        code: inferConfigErrorCode(issues, normalizedRuntimeEnv),
        context: toErrorContext(issues)
      });
    }
  });
};

export const env = createConfig();

export const requireConfigValue = <
  TConfig extends Record<string, unknown>,
  TKey extends keyof TConfig
>(
  config: TConfig,
  key: TKey
): Exclude<TConfig[TKey], null | undefined> => {
  const value = config[key];

  if (value === undefined || value === null || (typeof value === "string" && value === "")) {
    throw new ConfigError(`Missing required environment variable: ${String(key)}`, {
      code: ERROR_CODES.CONFIG_MISSING,
      context: { variable: key }
    });
  }

  return value as Exclude<TConfig[TKey], null | undefined>;
};

export const requireEnv = <TKey extends keyof typeof env>(
  key: TKey
): Exclude<(typeof env)[TKey], null | undefined> =>
  requireConfigValue(env, key);
