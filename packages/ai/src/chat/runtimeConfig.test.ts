import { describe, expect, test } from 'bun:test';
import { env } from '@cs/config';
import { createChatRuntimeConfig } from '@cs/ai';

describe("createChatRuntimeConfig", () => {
  test("defaults come from env-backed config", () => {
    const config = createChatRuntimeConfig();
    const expectedDeepSeekBaseUrl = env.DEEPSEEK_BASE_URL
      ? new URL(env.DEEPSEEK_BASE_URL).toString()
      : undefined;

    expect(config.providerOrder).toEqual(env.AI_PROVIDER_ORDER as typeof config.providerOrder);
    expect(config.requestTimeoutMs).toBe(env.AI_REQUEST_TIMEOUT_MS);
    expect(config.healthcheckTimeoutMs).toBe(env.AI_HEALTHCHECK_TIMEOUT_MS);
    expect(config.maxRetriesPerProvider).toBe(env.AI_MAX_RETRIES_PER_PROVIDER);
    expect(config.providers.deepseek.apiKey).toBe(env.DEEPSEEK_API_KEY);
    expect(config.providers.deepseek.baseUrl).toBe(expectedDeepSeekBaseUrl);
    expect(config.providers.deepseek.model).toBe(env.DEEPSEEK_CHAT_MODEL);
    expect(config.providers.gemini.apiKey).toBe(env.GEMINI_API_KEY);
    expect(config.providers.gemini.model).toBe(env.GEMINI_CHAT_MODEL);
    expect(config.providers.groq.apiKey).toBe(env.GROQ_API_KEY);
    expect(config.providers.groq.model).toBe(env.GROQ_CHAT_MODEL);
  });

  test("explicit overrides normalize correctly", () => {
    const config = createChatRuntimeConfig({
      providerOrder: ["groq", "gemini"],
      requestTimeoutMs: 20_000,
      healthcheckTimeoutMs: 4_000,
      maxRetriesPerProvider: 2,
      providers: {
        deepseek: {
          apiKey: "  deepseek-key  ",
          model: "  deepseek-chat  ",
          baseUrl: " https://api.deepseek.example/v1 ",
        },
        gemini: {
          apiKey: undefined,
          model: "  gemini-2.0-flash  ",
        },
        groq: {
          apiKey: "  groq-key  ",
          model: "  llama-3.3  ",
        },
      },
    });

    expect(config.providerOrder).toEqual(["groq", "gemini"]);
    expect(config.requestTimeoutMs).toBe(20_000);
    expect(config.healthcheckTimeoutMs).toBe(4_000);
    expect(config.maxRetriesPerProvider).toBe(2);
    expect(config.providers.deepseek).toEqual({
      apiKey: "deepseek-key",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.example/v1",
    });
    expect(config.providers.gemini.apiKey).toBeUndefined();
    expect(config.providers.gemini.model).toBe("gemini-2.0-flash");
    expect(config.providers.groq).toEqual({
      apiKey: "groq-key",
      model: "llama-3.3",
      baseUrl: undefined,
    });
  });

  test("throws on invalid provider order", () => {
    expect(() => createChatRuntimeConfig({ providerOrder: [] })).toThrow(
      "Invalid ChatRuntimeConfig.providerOrder: expected at least one provider",
    );
    expect(() =>
      createChatRuntimeConfig({ providerOrder: ["deepseek", "deepseek"] })
    ).toThrow("Invalid ChatRuntimeConfig.providerOrder: duplicate provider deepseek");
    expect(() =>
      createChatRuntimeConfig({ providerOrder: ["deepseek", "invalid" as "deepseek"] })
    ).toThrow("Invalid ChatRuntimeConfig.providerOrder: unknown provider invalid");
  });

  test("throws on invalid timeout values", () => {
    expect(() => createChatRuntimeConfig({ requestTimeoutMs: 0 })).toThrow(
      "Invalid ChatRuntimeConfig.requestTimeoutMs: expected a positive integer, received 0",
    );
    expect(() => createChatRuntimeConfig({ healthcheckTimeoutMs: -1 })).toThrow(
      "Invalid ChatRuntimeConfig.healthcheckTimeoutMs: expected a positive integer, received -1",
    );
    expect(() => createChatRuntimeConfig({ maxRetriesPerProvider: 1.5 })).toThrow(
      "Invalid ChatRuntimeConfig.maxRetriesPerProvider: expected a non-negative integer, received 1.5",
    );
  });

  test("throws on invalid base URLs", () => {
    expect(() =>
      createChatRuntimeConfig({
        providers: {
          deepseek: {
            baseUrl: "not-a-url",
          },
          gemini: {},
          groq: {},
        },
      })
    ).toThrow(
      "Invalid ChatRuntimeConfig.providers.deepseek.baseUrl: expected a valid URL, received not-a-url",
    );
  });
});
