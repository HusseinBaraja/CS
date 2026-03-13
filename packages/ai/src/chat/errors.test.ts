import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createChatProviderError } from './errors';

describe("createChatProviderError", () => {
  test("maps timeout errors to AI_TIMEOUT and retry_same_provider", () => {
    const error = createChatProviderError({
      provider: "gemini",
      kind: "timeout",
      message: "Timed out",
    });

    expect(error.code).toBe(ERROR_CODES.AI_TIMEOUT);
    expect(error.disposition).toBe("retry_same_provider");
    expect(error.retryable).toBe(true);
  });

  test("maps rate-limit and unavailable errors to failover_provider", () => {
    const rateLimitError = createChatProviderError({
      provider: "deepseek",
      kind: "rate_limit",
      message: "Slow down",
    });
    const unavailableError = createChatProviderError({
      provider: "groq",
      kind: "unavailable",
      message: "Down",
    });

    expect(rateLimitError.code).toBe(ERROR_CODES.AI_PROVIDER_FAILED);
    expect(rateLimitError.disposition).toBe("failover_provider");
    expect(rateLimitError.retryable).toBe(true);
    expect(unavailableError.disposition).toBe("failover_provider");
    expect(unavailableError.retryable).toBe(true);
  });

  test("maps invalid request and authentication errors to do_not_retry", () => {
    const invalidRequestError = createChatProviderError({
      provider: "deepseek",
      kind: "invalid_request",
      message: "Bad request",
    });
    const authenticationError = createChatProviderError({
      provider: "gemini",
      kind: "authentication",
      message: "Bad key",
    });

    expect(invalidRequestError.disposition).toBe("do_not_retry");
    expect(invalidRequestError.retryable).toBe(false);
    expect(authenticationError.disposition).toBe("do_not_retry");
    expect(authenticationError.retryable).toBe(false);
  });
});
