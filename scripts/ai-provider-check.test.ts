import { describe, expect, test } from 'bun:test';
import type { ChatProviderHealth, ChatProviderName, ChatRuntimeConfig } from '@cs/ai';
import {
  type AdapterResolver,
  AIProviderCheckArgumentError,
  formatProviderHealth,
  resolveRequestedProviders,
  runProviderHealthChecks,
} from './ai-provider-check';

const runtimeConfig: ChatRuntimeConfig = {
  providerOrder: ["deepseek", "gemini", "groq"],
  requestTimeoutMs: 15_000,
  healthcheckTimeoutMs: 5_000,
  maxRetriesPerProvider: 1,
  providers: {
    deepseek: {
      apiKey: "deepseek-key",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.example/v1",
    },
    gemini: {
      apiKey: "gemini-key",
      model: "gemini-2.0-flash",
    },
    groq: {
      apiKey: "groq-key",
      model: "llama-3.3-70b-versatile",
    },
  },
};

const createAdapterResolver = (
  implementation: (provider: ChatProviderName) => ChatProviderHealth | Promise<ChatProviderHealth>,
): AdapterResolver => (provider) => ({
  provider,
  async chat() {
    throw new Error("not used");
  },
  async healthCheck() {
    return implementation(provider);
  },
});

describe("resolveRequestedProviders", () => {
  test("defaults to the configured provider order", () => {
    expect(resolveRequestedProviders([], runtimeConfig.providerOrder)).toEqual([
      "deepseek",
      "gemini",
      "groq",
    ]);
  });

  test("deduplicates explicit provider names while preserving order", () => {
    expect(
      resolveRequestedProviders(["groq", "gemini", "groq"], runtimeConfig.providerOrder),
    ).toEqual(["groq", "gemini"]);
  });

  test("throws for unknown providers", () => {
    expect(() =>
      resolveRequestedProviders(["openai"], runtimeConfig.providerOrder),
    ).toThrow(AIProviderCheckArgumentError);
  });
});

describe("runProviderHealthChecks", () => {
  test("runs health checks with the configured timeout and retry settings", async () => {
    const calls: Array<{
      provider: ChatProviderName;
      options: { timeoutMs: number; maxRetries: number };
      config: ChatRuntimeConfig["providers"][ChatProviderName];
    }> = [];

    const results = await runProviderHealthChecks(
      ["deepseek", "gemini"],
      runtimeConfig,
      ((provider) => ({
        provider,
        async chat() {
          throw new Error("not used");
        },
        async healthCheck(config, options) {
          calls.push({
            provider,
            config,
            options: {
              timeoutMs: options?.timeoutMs ?? 0,
              maxRetries: options?.maxRetries ?? 0,
            },
          });

          return {
            provider,
            ok: true,
            model: config.model,
          };
        },
      })) satisfies AdapterResolver,
    );

    expect(calls).toEqual([
      {
        provider: "deepseek",
        config: runtimeConfig.providers.deepseek,
        options: {
          timeoutMs: 5_000,
          maxRetries: 1,
        },
      },
      {
        provider: "gemini",
        config: runtimeConfig.providers.gemini,
        options: {
          timeoutMs: 5_000,
          maxRetries: 1,
        },
      },
    ]);
    expect(results).toEqual([
      {
        provider: "deepseek",
        ok: true,
        model: "deepseek-chat",
      },
      {
        provider: "gemini",
        ok: true,
        model: "gemini-2.0-flash",
      },
    ]);
  });

  test("captures unexpected thrown errors as unhealthy results", async () => {
    const results = await runProviderHealthChecks(
      ["groq"],
      runtimeConfig,
      createAdapterResolver(async () => {
        throw new Error("socket failed");
      }),
    );

    expect(results).toEqual([
      {
        provider: "groq",
        ok: false,
        errorMessage: "socket failed",
      },
    ]);
  });
});

describe("formatProviderHealth", () => {
  test("formats healthy results with latency and model", () => {
    expect(
      formatProviderHealth({
        provider: "gemini",
        ok: true,
        model: "gemini-2.0-flash",
        latencyMs: 245,
      }),
    ).toBe("OK gemini model=gemini-2.0-flash latencyMs=245");
  });

  test("formats unhealthy results with normalized error details", () => {
    expect(
      formatProviderHealth({
        provider: "deepseek",
        ok: false,
        model: "deepseek-chat",
        error: {
          name: "ChatProviderError",
          message: "Missing API key for deepseek",
          kind: "configuration",
          disposition: "do_not_retry",
        } as ChatProviderHealth["error"],
      }),
    ).toBe(
      "FAIL deepseek model=deepseek-chat errorKind=configuration disposition=do_not_retry message=\"Missing API key for deepseek\"",
    );
  });

  test("formats fallback unhealthy results from unexpected exceptions", () => {
    expect(
      formatProviderHealth({
        provider: "groq",
        ok: false,
        errorMessage: "socket failed",
      }),
    ).toBe("FAIL groq message=\"socket failed\"");
  });
});
