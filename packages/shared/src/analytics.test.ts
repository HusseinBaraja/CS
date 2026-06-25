import { describe, expect, test } from "vitest";
import { ANALYTICS_HANDOFF_SOURCES, getAnalyticsIdempotencyKey, isValidHandoffSource } from "./analytics";

describe("getAnalyticsIdempotencyKey", () => {
  test("builds handoff idempotency key from pending message id", () => {
    expect(getAnalyticsIdempotencyKey("pending-1")).toBe("pendingMessage:pending-1:handoff_started");
  });
});

describe("isValidHandoffSource", () => {
  test("accepts every analytics handoff source", () => {
    for (const source of ANALYTICS_HANDOFF_SOURCES) {
      expect(isValidHandoffSource(source)).toBe(true);
    }
  });

  test("rejects unknown strings", () => {
    expect(isValidHandoffSource("api_manual")).toBe(false);
  });
});
