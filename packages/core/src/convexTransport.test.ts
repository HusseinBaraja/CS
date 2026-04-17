import { describe, expect, test } from 'bun:test';
import { isTransientConvexTransportError } from './convexTransport';

describe("isTransientConvexTransportError", () => {
  test("returns true for default transient socket close message", () => {
    expect(
      isTransientConvexTransportError(new Error("The socket connection was closed unexpectedly")),
    ).toBe(true);
  });

  test("returns true for default transient error codes", () => {
    expect(
      isTransientConvexTransportError(Object.assign(new Error("network"), { code: "ECONNRESET" })),
    ).toBe(true);
    expect(
      isTransientConvexTransportError(Object.assign(new Error("network"), { code: "ETIMEDOUT" })),
    ).toBe(true);
    expect(
      isTransientConvexTransportError(Object.assign(new Error("network"), { code: "EAI_AGAIN" })),
    ).toBe(true);
  });

  test("accepts extra transient codes", () => {
    expect(
      isTransientConvexTransportError(
        Object.assign(new Error("request aborted"), { code: "ECONNABORTED" }),
        ["ECONNABORTED"],
      ),
    ).toBe(true);
  });

  test("returns false for non-errors and non-transient errors", () => {
    expect(isTransientConvexTransportError("timeout")).toBe(false);
    expect(
      isTransientConvexTransportError(new Error("validation failed")),
    ).toBe(false);
  });
});
