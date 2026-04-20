import { describe, expect, test } from "bun:test";
import { getAnalyticsIdempotencyKey } from "./analytics";

describe("getAnalyticsIdempotencyKey", () => {
  test("builds handoff idempotency key from pending message id", () => {
    expect(getAnalyticsIdempotencyKey("pending-1")).toBe("pendingMessage:pending-1:handoff_started");
  });
});
