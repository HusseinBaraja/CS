import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import {
  createRateLimitMiddleware,
  maybePruneRateLimitEntries,
  pruneExpiredRateLimitEntries
} from './rateLimit';

const createRateLimitTestApp = (options: Parameters<typeof createRateLimitMiddleware>[0]) => {
  const app = new Hono();

  app.use("*", createRateLimitMiddleware(options));
  app.get("/api", (c) => c.json({ ok: true }));

  return app;
};

describe("rate limit store pruning", () => {
  test("removes expired entries", () => {
    const requests = new Map([
      ["expired", { count: 1, resetAt: 100 }],
      ["active", { count: 2, resetAt: 300 }]
    ]);

    pruneExpiredRateLimitEntries(requests, 200);

    expect(requests.has("expired")).toBe(false);
    expect(requests.get("active")).toEqual({ count: 2, resetAt: 300 });
  });

  test("retains live entries", () => {
    const requests = new Map([
      ["active", { count: 1, resetAt: 300 }]
    ]);

    pruneExpiredRateLimitEntries(requests, 200);

    expect(requests.get("active")).toEqual({ count: 1, resetAt: 300 });
  });

  test("does not prune again before the next prune boundary", () => {
    const requests = new Map([
      ["active", { count: 1, resetAt: 600 }]
    ]);

    const first = maybePruneRateLimitEntries(requests, 100, 0, 500);
    const second = maybePruneRateLimitEntries(
      requests,
      150,
      first.nextPruneAt,
      500
    );

    expect(first).toEqual({
      didPrune: true,
      nextPruneAt: 600
    });
    expect(second).toEqual({
      didPrune: false,
      nextPruneAt: 600
    });
    expect(requests.get("active")).toEqual({ count: 1, resetAt: 600 });
  });
});

describe("rate limit client identification", () => {
  test("ignores forwarded headers from untrusted peers", async () => {
    const app = createRateLimitTestApp({
      max: 1,
      windowMs: 60_000,
      trustedProxyHops: 1,
      trustedProxyIps: ["192.0.2.10"]
    });

    const first = await app.request(
      "/api",
      {
        headers: {
          "x-forwarded-for": "198.51.100.10, 192.0.2.20",
          "x-real-ip": "198.51.100.99"
        }
      },
      {
        incoming: {
          socket: {
            remoteAddress: "192.0.2.20"
          }
        }
      }
    );
    const second = await app.request(
      "/api",
      {
        headers: {
          "x-forwarded-for": "198.51.100.11, 192.0.2.20",
          "x-real-ip": "198.51.100.100"
        }
      },
      {
        incoming: {
          socket: {
            remoteAddress: "192.0.2.20"
          }
        }
      }
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("trusts forwarded headers from allowlisted proxies", async () => {
    const app = createRateLimitTestApp({
      max: 1,
      windowMs: 60_000,
      trustedProxyHops: 1,
      trustedProxyIps: ["192.0.2.10"]
    });

    const first = await app.request(
      "/api",
      {
        headers: {
          "x-forwarded-for": "198.51.100.10, 192.0.2.10"
        }
      },
      {
        incoming: {
          socket: {
            remoteAddress: "192.0.2.10"
          }
        }
      }
    );
    const second = await app.request(
      "/api",
      {
        headers: {
          "x-forwarded-for": "198.51.100.11, 192.0.2.10"
        }
      },
      {
        incoming: {
          socket: {
            remoteAddress: "::ffff:192.0.2.10"
          }
        }
      }
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("falls back to the direct connection IP when proxy peers are not allowlisted", async () => {
    const app = createRateLimitTestApp({
      max: 1,
      windowMs: 60_000,
      trustedProxyHops: 1,
      trustedProxyIps: ["192.0.2.10"]
    });

    const first = await app.request(
      "/api",
      {
        headers: {
          "x-forwarded-for": "198.51.100.10, 192.0.2.20"
        }
      },
      {
        incoming: {
          socket: {
            remoteAddress: "::ffff:203.0.113.10"
          }
        }
      }
    );
    const second = await app.request(
      "/api",
      {
        headers: {
          "x-forwarded-for": "198.51.100.11, 192.0.2.20"
        }
      },
      {
        incoming: {
          socket: {
            remoteAddress: "203.0.113.10"
          }
        }
      }
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
