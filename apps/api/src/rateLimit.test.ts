import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import {
  createRateLimitMiddleware,
  enforceRateLimitStoreCapacity,
  maybePruneRateLimitEntries,
  pruneExpiredRateLimitEntries,
  scheduleRateLimitEntryCleanup
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
      ["expired", { count: 1, resetAt: 100, expiresAt: 100 }],
      ["active", { count: 2, resetAt: 300, expiresAt: 300 }]
    ]);

    pruneExpiredRateLimitEntries(requests, 200);

    expect(requests.has("expired")).toBe(false);
    expect(requests.get("active")).toEqual({ count: 2, resetAt: 300, expiresAt: 300 });
  });

  test("retains live entries", () => {
    const requests = new Map([
      ["active", { count: 1, resetAt: 300, expiresAt: 300 }]
    ]);

    pruneExpiredRateLimitEntries(requests, 200);

    expect(requests.get("active")).toEqual({ count: 1, resetAt: 300, expiresAt: 300 });
  });

  test("does not prune again before the next prune boundary", () => {
    const requests = new Map([
      ["active", { count: 1, resetAt: 600, expiresAt: 600 }]
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
    expect(requests.get("active")).toEqual({ count: 1, resetAt: 600, expiresAt: 600 });
  });

  test("prunes expired entries before evicting live ones for capacity", () => {
    const requests = new Map([
      ["expired", { count: 1, resetAt: 50, expiresAt: 50 }],
      ["active", { count: 1, resetAt: 300, expiresAt: 300 }]
    ]);

    enforceRateLimitStoreCapacity(requests, 100, 1);

    expect(requests.has("expired")).toBe(false);
    expect(requests.get("active")).toEqual({ count: 1, resetAt: 300, expiresAt: 300 });
  });

  test("evicts the least recently used live entry when capacity is reached", () => {
    const requests = new Map([
      ["oldest", { count: 1, resetAt: 300, expiresAt: 300 }],
      ["newest", { count: 1, resetAt: 400, expiresAt: 400 }]
    ]);

    enforceRateLimitStoreCapacity(requests, 100, 1);

    expect(requests.has("oldest")).toBe(false);
    expect(requests.get("newest")).toEqual({ count: 1, resetAt: 400, expiresAt: 400 });
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

describe("rate limit entry cleanup", () => {
  test("deletes idle entries after their expiry", async () => {
    const requests = new Map([
      ["ip:203.0.113.10", { count: 1, resetAt: 5, expiresAt: 5 }]
    ]);

    scheduleRateLimitEntryCleanup(requests, "ip:203.0.113.10", 5, 5);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(requests.has("ip:203.0.113.10")).toBe(false);
  });

  test("ignores stale cleanup timers after an entry is refreshed", async () => {
    const requests = new Map([
      ["ip:203.0.113.10", { count: 1, resetAt: 5, expiresAt: 5 }]
    ]);

    scheduleRateLimitEntryCleanup(requests, "ip:203.0.113.10", 5, 5);
    requests.set("ip:203.0.113.10", {
      count: 1,
      resetAt: 25,
      expiresAt: 25
    });
    scheduleRateLimitEntryCleanup(requests, "ip:203.0.113.10", 25, 25);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(requests.get("ip:203.0.113.10")).toEqual({
      count: 1,
      resetAt: 25,
      expiresAt: 25
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requests.has("ip:203.0.113.10")).toBe(false);
  });
});

describe("rate limit store capacity", () => {
  test("evicts the least recently used client when the store reaches maxEntries", async () => {
    const app = createRateLimitTestApp({
      max: 1,
      maxEntries: 2,
      windowMs: 60_000,
      getClientId: (context) => context.req.header("x-client-id") ?? "missing-client-id"
    });

    const clientAHeaders = { "x-client-id": "client-a" };
    const clientBHeaders = { "x-client-id": "client-b" };
    const clientCHeaders = { "x-client-id": "client-c" };

    const clientAFirst = await app.request("/api", { headers: clientAHeaders });
    const clientBFirst = await app.request("/api", { headers: clientBHeaders });
    const clientASecond = await app.request("/api", { headers: clientAHeaders });
    const clientCFirst = await app.request("/api", { headers: clientCHeaders });
    const clientAAfterClientC = await app.request("/api", { headers: clientAHeaders });
    const clientBAfterEviction = await app.request("/api", { headers: clientBHeaders });

    expect(clientAFirst.status).toBe(200);
    expect(clientBFirst.status).toBe(200);
    expect(clientASecond.status).toBe(429);
    expect(clientCFirst.status).toBe(200);
    expect(clientAAfterClientC.status).toBe(429);
    expect(clientBAfterEviction.status).toBe(200);
  });
});
