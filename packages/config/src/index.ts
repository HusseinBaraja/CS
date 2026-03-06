import { createEnv } from "@t3-oss/env-core";
import type { StandardSchemaV1 } from "@t3-oss/env-core";
import { z } from "zod";
import { ConfigError, ERROR_CODES } from "@cs/shared";

const envSchema = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
  LOG_DIR: z.string().min(1).default("logs"),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  API_PORT: z.coerce.number().int().positive().default(3000),
  CONVEX_URL: z.string().url().optional()
};

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

const isMissingIssue = (issue: StandardSchemaV1.Issue): boolean => {
  const issueText = issue.message.toLowerCase();
  return (
    issueText.includes("required") ||
    issueText.includes("expected string") ||
    issueText.includes("undefined")
  );
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
  runtimeEnv: Record<string, string | number | boolean | undefined> = process.env
) =>
  createEnv({
    server: envSchema,
    runtimeEnv,
    emptyStringAsUndefined: true,
    onValidationError: (issues) => {
      throw new ConfigError(formatValidationIssues(issues), {
        code: issues.every(isMissingIssue)
          ? ERROR_CODES.CONFIG_MISSING
          : ERROR_CODES.CONFIG_INVALID,
        context: toErrorContext(issues)
      });
    }
  });

export const env = createConfig();

export const requireConfigValue = <
  TConfig extends Record<string, unknown>,
  TKey extends keyof TConfig
>(
  config: TConfig,
  key: TKey
): NonNullable<TConfig[TKey]> => {
  const value = config[key];

  if (value === undefined || value === null || value === "") {
    throw new ConfigError(`Missing required environment variable: ${String(key)}`, {
      code: ERROR_CODES.CONFIG_MISSING,
      context: { variable: key }
    });
  }

  return value;
};

export const requireEnv = <TKey extends keyof typeof env>(
  key: TKey
): NonNullable<(typeof env)[TKey]> =>
  requireConfigValue(env, key);
