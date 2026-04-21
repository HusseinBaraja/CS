import { describe, expect, test } from 'bun:test';
import { isTransientConvexTransportError } from './convexTransport';

describe("isTransientConvexTransportError", () => {
  test("returns true for default transient socket close message", () => {
    expect(
      isTransientConvexTransportError(new Error("The socket connection was closed unexpectedly")),
    ).toBe(true);
  });

  test("returns true for convex connectivity message", () => {
    expect(
      isTransientConvexTransportError(
        new Error("Unable to connect. Is the computer able to access the url?"),
      ),
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
    expect(
      isTransientConvexTransportError(Object.assign(new Error("network"), { code: "UND_ERR_CONNECT_TIMEOUT" })),
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

  test("returns true when a transient timeout is in the error cause chain", () => {
    const transientCause = new Error(
      "Connect Timeout Error (attempted address: glad-barracuda-955.convex.cloud:443, timeout: 10000ms)",
    );

    expect(
      isTransientConvexTransportError(
        new Error("fetch failed", {
          cause: transientCause,
        }),
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
