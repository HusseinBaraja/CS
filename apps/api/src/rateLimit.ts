import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono/types';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from './responses';

const DEFAULT_EXEMPT_PATHS = ["/api/health", "/api/ready"];
const API_PATH_PREFIX = "/api";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  exemptPaths?: string[];
  now?: () => number;
  getClientId?: (context: Context) => string;
}

const getForwardedClientId = (context: Context): string => {
  const forwardedFor = context.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return context.req.header("x-real-ip") ?? "unknown";
};

export const createRateLimitMiddleware = (
  options: RateLimitOptions
): MiddlewareHandler => {
  const now = options.now ?? (() => Date.now());
  const exemptPaths = new Set(options.exemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const getClientId = options.getClientId ?? getForwardedClientId;
  const requests = new Map<string, RateLimitRecord>();

  return async (c, next) => {
    if (
      !c.req.path.startsWith(API_PATH_PREFIX) ||
      c.req.method === "OPTIONS" ||
      exemptPaths.has(c.req.path)
    ) {
      await next();
      return;
    }

    const currentTime = now();
    const key = `${getClientId(c)}:${c.req.path}`;
    const existing = requests.get(key);

    if (!existing || existing.resetAt <= currentTime) {
      requests.set(key, {
        count: 1,
        resetAt: currentTime + options.windowMs
      });

      c.header("X-RateLimit-Limit", String(options.max));
      c.header("X-RateLimit-Remaining", String(options.max - 1));
      c.header("X-RateLimit-Reset", String(Math.ceil((currentTime + options.windowMs) / 1000)));

      await next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - currentTime) / 1000)
      );

      c.header("Retry-After", String(retryAfterSeconds));
      c.header("X-RateLimit-Limit", String(options.max));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil(existing.resetAt / 1000)));

      return c.json(
        createErrorResponse(ERROR_CODES.RATE_LIMIT_EXCEEDED, "Rate limit exceeded"),
        429
      );
    }

    existing.count += 1;

    c.header("X-RateLimit-Limit", String(options.max));
    c.header("X-RateLimit-Remaining", String(options.max - existing.count));
    c.header("X-RateLimit-Reset", String(Math.ceil(existing.resetAt / 1000)));

    await next();
  };
};
