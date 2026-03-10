import { describe, expect, test } from 'bun:test';
import { maybePruneRateLimitEntries, pruneExpiredRateLimitEntries } from './rateLimit';

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
