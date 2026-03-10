import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono/types';
import { ERROR_CODES } from '@cs/shared';
import { isProtectedApiPath } from './apiPath';
import { createErrorResponse } from './responses';

const DEFAULT_EXEMPT_PATHS = ["/api/health", "/api/ready"];

export interface ApiKeyAuthOptions {
  apiKey?: string;
  exemptPaths?: string[];
  headerName?: string;
}

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(/\s+/u);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

const getApiKey = (
  context: Context,
  headerName: string
): string | null =>
  context.req.header(headerName) ?? getBearerToken(context.req.header("authorization"));

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
};

export const createApiKeyAuthMiddleware = (
  options: ApiKeyAuthOptions = {}
): MiddlewareHandler => {
  const exemptPaths = new Set(options.exemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const headerName = options.headerName ?? "x-api-key";
  const authenticatedClientId = options.apiKey
    ? createHash("sha256").update(options.apiKey).digest("hex").slice(0, 16)
    : null;

  return async (c, next) => {
    if (
      !isProtectedApiPath(c.req.path) ||
      c.req.method === "OPTIONS" ||
      exemptPaths.has(c.req.path)
    ) {
      await next();
      return;
    }

    if (!options.apiKey) {
      return c.json(
        createErrorResponse(
          ERROR_CODES.CONFIG_MISSING,
          "API authentication is not configured"
        ),
        503
      );
    }

    const providedApiKey = getApiKey(c, headerName);
    if (!providedApiKey) {
      return c.json(
        createErrorResponse(ERROR_CODES.AUTH_FAILED, "Missing API key"),
        401
      );
    }

    if (!safeEqual(providedApiKey, options.apiKey)) {
      return c.json(
        createErrorResponse(ERROR_CODES.AUTH_TOKEN_INVALID, "Invalid API key"),
        403
      );
    }

    c.set("authenticatedClientId", authenticatedClientId);
    await next();
  };
};
