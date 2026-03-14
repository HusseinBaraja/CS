import { describe, expect, test } from 'bun:test';
import { createChatProviderError } from '../errors';
import { runWithRetries } from './shared';

describe("chat adapter shared utilities", () => {
  test("retries timed out requests up to the configured budget", async () => {
    let attempts = 0;

    await expect(
      runWithRetries(
        "deepseek",
        "deepseek-chat",
        5,
        1,
        undefined,
        (error) =>
          createChatProviderError({
            provider: "deepseek",
            kind: "unknown",
            message: error instanceof Error ? error.message : "unknown",
          }),
        (signal) => new Promise((_, reject) => {
          attempts += 1;
          signal.addEventListener("abort", () => {
            reject(new Error("timed out"));
          }, { once: true });
        }),
      ),
    ).rejects.toMatchObject({
      kind: "timeout",
      disposition: "retry_same_provider",
      retryable: true,
    });

    expect(attempts).toBe(2);
  });

  test("does not retry non-retryable provider errors", async () => {
    let attempts = 0;

    await expect(
      runWithRetries(
        "groq",
        "llama-3.3-70b-versatile",
        50,
        3,
        undefined,
        (error) =>
          error instanceof Error
            ? createChatProviderError({
              provider: "groq",
              kind: "invalid_request",
              message: error.message,
              retryable: false,
            })
            : createChatProviderError({
              provider: "groq",
              kind: "invalid_request",
              message: "invalid request",
              retryable: false,
            }),
        async () => {
          attempts += 1;
          throw new Error("bad payload");
        },
      ),
    ).rejects.toMatchObject({
      kind: "invalid_request",
      disposition: "do_not_retry",
      retryable: false,
    });

    expect(attempts).toBe(1);
  });

  test("stops before any retry work when the caller signal is already aborted", async () => {
    let attempts = 0;
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));

    await expect(
      runWithRetries(
        "gemini",
        "gemini-2.0-flash",
        50,
        2,
        controller.signal,
        (error) =>
          createChatProviderError({
            provider: "gemini",
            kind: "unknown",
            message: error instanceof Error ? error.message : "unknown",
          }),
        async () => {
          attempts += 1;
          return "unreachable";
        },
      ),
    ).rejects.toThrow("cancelled");

    expect(attempts).toBe(0);
  });
});
