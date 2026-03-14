import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import type { ChatProviderHealth, ChatProviderName, ChatRequest, ChatResponse, ChatRuntimeConfig } from '../index';
import { createChatProviderError } from './errors';
import {
  type ChatManagerLogger,
  type ChatProviderAdapterResolver,
  ChatProviderChainError,
  createChatProviderManager,
} from './manager';

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

const request: ChatRequest = {
  messages: [
    {
      role: "user",
      content: "Customer asks for burger boxes and should not appear in logs",
    },
  ],
};

const createLoggerStub = (): {
  logger: ChatManagerLogger;
  infoCalls: Array<{ payload: Record<string, unknown>; message: string }>;
  warnCalls: Array<{ payload: Record<string, unknown>; message: string }>;
  errorCalls: Array<{ payload: Record<string, unknown>; message: string }>;
} => {
  const infoCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const warnCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const errorCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];

  return {
    logger: {
      info(payload, message) {
        infoCalls.push({ payload, message });
      },
      warn(payload, message) {
        warnCalls.push({ payload, message });
      },
      error(payload, message) {
        errorCalls.push({ payload, message });
      },
    },
    infoCalls,
    warnCalls,
    errorCalls,
  };
};

const createResponse = (
  provider: ChatProviderName,
  model: string,
  text = `response from ${provider}`,
): ChatResponse => ({
  provider,
  model,
  text,
  finishReason: "stop",
});

const createResolver = (
  behavior: Partial<
    Record<
      ChatProviderName,
      {
        chat?: (provider: ChatProviderName) => Promise<ChatResponse>;
        healthCheck?: (provider: ChatProviderName) => Promise<ChatProviderHealth>;
      }
    >
  >,
  calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }>,
): ChatProviderAdapterResolver => (provider) => ({
  provider,
  async chat() {
    calls.push({ provider, kind: "chat" });
    const chat = behavior[provider]?.chat;
    if (!chat) {
      throw new Error(`missing chat behavior for ${provider}`);
    }

    return chat(provider);
  },
  async healthCheck() {
    calls.push({ provider, kind: "healthCheck" });
    const healthCheck = behavior[provider]?.healthCheck;
    if (!healthCheck) {
      return {
        provider,
        ok: true,
        model: runtimeConfig.providers[provider].model,
      };
    }

    return healthCheck(provider);
  },
});

describe("createChatProviderManager", () => {
  test("uses the primary provider when it succeeds", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const { logger, infoCalls, warnCalls } = createLoggerStub();
    const manager = createChatProviderManager({
      runtimeConfig,
      logger,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              return createResponse("deepseek", "deepseek-chat");
            },
          },
        },
        calls,
      ),
    });

    const response = await manager.chat(request, {
      logContext: { companyId: "company-1", requestId: "req-1" },
    });

    expect(response).toEqual(createResponse("deepseek", "deepseek-chat"));
    expect(calls).toEqual([{ provider: "deepseek", kind: "chat" }]);
    expect(warnCalls).toHaveLength(0);
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0]).toMatchObject({
      message: "ai provider request succeeded",
      payload: {
        provider: "deepseek",
        model: "deepseek-chat",
        failoverOccurred: false,
        attemptedProviders: ["deepseek"],
        context: {
          companyId: "company-1",
          requestId: "req-1",
        },
      },
    });
  });

  test("fails over to the next provider after a failover-worthy failure", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const { logger, infoCalls, warnCalls } = createLoggerStub();
    const manager = createChatProviderManager({
      runtimeConfig,
      logger,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              throw createChatProviderError({
                provider: "deepseek",
                kind: "rate_limit",
                message: "DeepSeek throttled",
              });
            },
          },
          gemini: {
            async chat() {
              return createResponse("gemini", "gemini-2.0-flash");
            },
          },
        },
        calls,
      ),
    });

    const response = await manager.chat(request);

    expect(response).toEqual(createResponse("gemini", "gemini-2.0-flash"));
    expect(calls).toEqual([
      { provider: "deepseek", kind: "chat" },
      { provider: "gemini", kind: "chat" },
    ]);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]).toMatchObject({
      message: "ai provider request failed; failing over to next provider",
      payload: {
        provider: "deepseek",
        errorKind: "rate_limit",
        disposition: "failover_provider",
        nextProvider: "gemini",
      },
    });
    expect(infoCalls[0]).toMatchObject({
      message: "ai provider request succeeded after failover",
      payload: {
        provider: "gemini",
        failoverOccurred: true,
        attemptedProviders: ["deepseek", "gemini"],
      },
    });
  });

  test("moves to the next provider after retry_same_provider errors escape adapter retries", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              throw createChatProviderError({
                provider: "deepseek",
                kind: "timeout",
                message: "DeepSeek timed out",
              });
            },
          },
          gemini: {
            async chat() {
              return createResponse("gemini", "gemini-2.0-flash");
            },
          },
        },
        calls,
      ),
    });

    const response = await manager.chat(request);

    expect(response.provider).toBe("gemini");
    expect(calls).toEqual([
      { provider: "deepseek", kind: "chat" },
      { provider: "gemini", kind: "chat" },
    ]);
  });

  test("stops immediately on do_not_retry failures", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const { logger, errorCalls } = createLoggerStub();
    const manager = createChatProviderManager({
      runtimeConfig,
      logger,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              throw createChatProviderError({
                provider: "deepseek",
                kind: "authentication",
                message: "DeepSeek key rejected",
              });
            },
          },
          gemini: {
            async chat() {
              return createResponse("gemini", "gemini-2.0-flash");
            },
          },
        },
        calls,
      ),
    });

    await expect(manager.chat(request)).rejects.toMatchObject({
      name: "ChatProviderChainError",
      code: ERROR_CODES.AI_PROVIDER_FAILED,
      attemptedProviders: ["deepseek"],
      terminalProvider: "deepseek",
      terminalDisposition: "do_not_retry",
    });
    expect(calls).toEqual([{ provider: "deepseek", kind: "chat" }]);
    expect(errorCalls).toHaveLength(1);
  });

  test("surfaces a normalized chain error after all providers fail", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              throw createChatProviderError({
                provider: "deepseek",
                kind: "unavailable",
                message: "DeepSeek unavailable",
              });
            },
          },
          gemini: {
            async chat() {
              throw createChatProviderError({
                provider: "gemini",
                kind: "timeout",
                message: "Gemini timed out",
              });
            },
          },
          groq: {
            async chat() {
              throw createChatProviderError({
                provider: "groq",
                kind: "rate_limit",
                message: "Groq throttled",
              });
            },
          },
        },
        calls,
      ),
    });

    await expect(manager.chat(request)).rejects.toMatchObject({
      name: "ChatProviderChainError",
      code: ERROR_CODES.AI_PROVIDER_FAILED,
      attemptedProviders: ["deepseek", "gemini", "groq"],
      terminalProvider: "groq",
      terminalDisposition: "provider_chain_exhausted",
      failures: [
        { provider: "deepseek", kind: "unavailable" },
        { provider: "gemini", kind: "timeout" },
        { provider: "groq", kind: "rate_limit" },
      ],
    });
    expect(calls).toEqual([
      { provider: "deepseek", kind: "chat" },
      { provider: "gemini", kind: "chat" },
      { provider: "groq", kind: "chat" },
    ]);
  });

  test("uses AI_TIMEOUT when every provider failed with a timeout", async () => {
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              throw createChatProviderError({
                provider: "deepseek",
                kind: "timeout",
                message: "DeepSeek timed out",
              });
            },
          },
          gemini: {
            async chat() {
              throw createChatProviderError({
                provider: "gemini",
                kind: "timeout",
                message: "Gemini timed out",
              });
            },
          },
          groq: {
            async chat() {
              throw createChatProviderError({
                provider: "groq",
                kind: "timeout",
                message: "Groq timed out",
              });
            },
          },
        },
        [],
      ),
    });

    await expect(manager.chat(request)).rejects.toMatchObject({
      code: ERROR_CODES.AI_TIMEOUT,
      terminalDisposition: "provider_chain_exhausted",
    });
  });

  test("preserves failure order and details on the chain error", async () => {
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              throw createChatProviderError({
                provider: "deepseek",
                kind: "unavailable",
                message: "DeepSeek unavailable",
                statusCode: 503,
              });
            },
          },
          gemini: {
            async chat() {
              throw createChatProviderError({
                provider: "gemini",
                kind: "timeout",
                message: "Gemini timed out",
              });
            },
          },
          groq: {
            async chat() {
              throw createChatProviderError({
                provider: "groq",
                kind: "response_format",
                message: "Groq returned empty text",
                disposition: "do_not_retry",
                retryable: false,
              });
            },
          },
        },
        [],
      ),
    });

    try {
      await manager.chat(request);
      throw new Error("expected manager.chat to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ChatProviderChainError);
      const chainError = error as ChatProviderChainError;
      expect(chainError.failures).toEqual([
        {
          provider: "deepseek",
          model: "deepseek-chat",
          kind: "unavailable",
          disposition: "failover_provider",
          message: "DeepSeek unavailable",
          statusCode: 503,
        },
        {
          provider: "gemini",
          model: "gemini-2.0-flash",
          kind: "timeout",
          disposition: "retry_same_provider",
          message: "Gemini timed out",
        },
        {
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          kind: "response_format",
          disposition: "do_not_retry",
          message: "Groq returned empty text",
        },
      ]);
    }
  });

  test("stops before calling any provider when the caller signal is already aborted", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const controller = new AbortController();
    controller.abort(new Error("caller aborted"));

    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              return createResponse("deepseek", "deepseek-chat");
            },
          },
        },
        calls,
      ),
    });

    await expect(
      manager.chat(request, { signal: controller.signal }),
    ).rejects.toThrow("caller aborted");
    expect(calls).toEqual([]);
  });

  test("logs failover metadata without leaking prompts or secrets", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const { logger, infoCalls, warnCalls } = createLoggerStub();
    const manager = createChatProviderManager({
      runtimeConfig: {
        ...runtimeConfig,
        providers: {
          ...runtimeConfig.providers,
          deepseek: {
            ...runtimeConfig.providers.deepseek,
            apiKey: "deepseek-secret-key",
          },
        },
      },
      logger,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              throw createChatProviderError({
                provider: "deepseek",
                kind: "rate_limit",
                message: "DeepSeek throttled",
              });
            },
          },
          gemini: {
            async chat() {
              return createResponse("gemini", "gemini-2.0-flash");
            },
          },
        },
        calls,
      ),
    });

    await manager.chat(request, {
      logContext: {
        companyId: "company-1",
        conversationId: "conversation-1",
      },
    });

    const serializedLogs = JSON.stringify([...warnCalls, ...infoCalls]);
    expect(serializedLogs).not.toContain(
      "Customer asks for burger boxes and should not appear in logs",
    );
    expect(serializedLogs).not.toContain("deepseek-secret-key");
    expect(serializedLogs).toContain("company-1");
    expect(serializedLogs).toContain("conversation-1");
  });

  test("returns provider probes in the requested order and warns when any are unhealthy", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const { logger, infoCalls, warnCalls } = createLoggerStub();
    const manager = createChatProviderManager({
      runtimeConfig,
      logger,
      resolveAdapter: createResolver(
        {
          gemini: {
            async healthCheck() {
              return {
                provider: "gemini",
                ok: false,
                model: "gemini-2.0-flash",
                error: createChatProviderError({
                  provider: "gemini",
                  kind: "unavailable",
                  message: "Gemini unavailable",
                  disposition: "failover_provider",
                }),
              };
            },
          },
          deepseek: {
            async healthCheck() {
              return {
                provider: "deepseek",
                ok: true,
                model: "deepseek-chat",
              };
            },
          },
        },
        calls,
      ),
    });

    const results = await manager.probeProviders({
      providers: ["gemini", "deepseek"],
      logContext: { feature: "startup-check" },
    });

    expect(results).toEqual([
      {
        provider: "gemini",
        ok: false,
        model: "gemini-2.0-flash",
        error: expect.objectContaining({
          kind: "unavailable",
          disposition: "failover_provider",
          message: "Gemini unavailable",
        }),
      },
      {
        provider: "deepseek",
        ok: true,
        model: "deepseek-chat",
      },
    ]);
    expect(calls).toEqual([
      { provider: "gemini", kind: "healthCheck" },
      { provider: "deepseek", kind: "healthCheck" },
    ]);
    expect(infoCalls).toHaveLength(0);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]).toMatchObject({
      message: "ai provider probes completed with unhealthy providers",
      payload: {
        providers: ["gemini", "deepseek"],
        unhealthyProviders: ["gemini"],
        context: { feature: "startup-check" },
      },
    });
  });

  test("throws for invalid probe provider names", async () => {
    const manager = createChatProviderManager({ runtimeConfig });

    await expect(
      manager.probeProviders({
        providers: ["invalid" as ChatProviderName],
      }),
    ).rejects.toThrow(
      'Unknown AI provider "invalid". Expected one of: deepseek, gemini, groq',
    );
  });
});
