import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono/types';
import { ERROR_CODES } from '@cs/shared';
import { isProtectedApiPath } from './apiPath';
import { createErrorResponse } from './responses';

const DEFAULT_EXEMPT_PATHS = ["/api/health", "/api/ready"];

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface RateLimitPruneResult {
  didPrune: boolean;
  nextPruneAt: number;
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  trustedProxyHops?: number;
  exemptPaths?: string[];
  now?: () => number;
  getClientId?: (context: Context) => string;
}

interface NodeSocketBindings {
  incoming?: {
    socket?: {
      remoteAddress?: string | null;
    };
  };
}

const normalizeClientIp = (value: string | null | undefined): string | null => {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : null;
};

const parseForwardedFor = (forwardedFor: string): string[] =>
  forwardedFor
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const getTrustedProxyClientIp = (
  context: Context,
  trustedProxyHops: number
): string | null => {
  if (trustedProxyHops <= 0) {
    return null;
  }

  const forwardedFor = context.req.header("x-forwarded-for");
  if (forwardedFor) {
    const chain = parseForwardedFor(forwardedFor);
    const clientIndex = chain.length - trustedProxyHops - 1;

    return clientIndex >= 0 ? normalizeClientIp(chain[clientIndex]) : null;
  }

  return normalizeClientIp(context.req.header("x-real-ip"));
};

const getConnectionClientIp = (context: Context): string | null =>
  normalizeClientIp(
    (context.env as NodeSocketBindings | undefined)?.incoming?.socket?.remoteAddress
  );

export const pruneExpiredRateLimitEntries = (
  requests: Map<string, RateLimitRecord>,
  currentTime: number
): void => {
  for (const [key, record] of requests) {
    if (record.resetAt <= currentTime) {
      requests.delete(key);
    }
  }
};

export const maybePruneRateLimitEntries = (
  requests: Map<string, RateLimitRecord>,
  currentTime: number,
  nextPruneAt: number,
  windowMs: number
): RateLimitPruneResult => {
  if (currentTime < nextPruneAt) {
    return {
      didPrune: false,
      nextPruneAt
    };
  }

  pruneExpiredRateLimitEntries(requests, currentTime);

  return {
    didPrune: true,
    nextPruneAt: currentTime + windowMs
  };
};

export const createRateLimitMiddleware = (
  options: RateLimitOptions
): MiddlewareHandler => {
  const now = options.now ?? (() => Date.now());
  const exemptPaths = new Set(options.exemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const trustedProxyHops = options.trustedProxyHops ?? 0;
  const getClientId = options.getClientId ?? ((context: Context) => {
    const authenticatedClientId = context.get("authenticatedClientId");
    const clientIp = getTrustedProxyClientIp(context, trustedProxyHops) ??
      getConnectionClientIp(context);

    return clientIp
      ? `${authenticatedClientId}:${clientIp}`
      : authenticatedClientId;
  });
  const requests = new Map<string, RateLimitRecord>();
  let nextPruneAt = 0;

  return async (c, next) => {
    if (
      !isProtectedApiPath(c.req.path) ||
      c.req.method === "OPTIONS" ||
      exemptPaths.has(c.req.path)
    ) {
      await next();
      return;
    }

    const currentTime = now();
    nextPruneAt = maybePruneRateLimitEntries(
      requests,
      currentTime,
      nextPruneAt,
      options.windowMs
    ).nextPruneAt;
    const key = getClientId(c);
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
