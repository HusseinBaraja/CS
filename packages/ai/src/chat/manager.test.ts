import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import type { ChatProviderHealth, ChatProviderName, ChatRequest, ChatResponse, ChatRuntimeConfig } from '../index';
import { createChatProviderError } from './errors';
import {
  type ChatManagerLogger,
  type ChatProviderAdapterResolver,
  ChatProviderChainError,
  createChatProviderManager,
  createRetrievalRewriteChatProviderManager,
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

  const createLogger = (bindings: Record<string, unknown> = {}): ChatManagerLogger => ({
    debug(payload, message) {
      infoCalls.push({ payload: { ...bindings, ...payload }, message });
    },
    info(payload, message) {
      infoCalls.push({ payload: { ...bindings, ...payload }, message });
    },
    warn(payload, message) {
      warnCalls.push({ payload: { ...bindings, ...payload }, message });
    },
    error(payload, message) {
      errorCalls.push({ payload: { ...bindings, ...payload }, message });
    },
    child(childBindings) {
      return createLogger({ ...bindings, ...childBindings });
    },
  });

  return {
    logger: createLogger(),
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
      message: "ai provider request completed",
      payload: {
        event: "ai.provider.request_completed",
        runtime: "ai",
        surface: "chat",
        outcome: "success",
        companyId: "company-1",
        requestId: "req-1",
        provider: "deepseek",
        model: "deepseek-chat",
        failoverOccurred: false,
        attemptedProviders: ["deepseek"],
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
    expect(warnCalls).toHaveLength(2);
    expect(warnCalls[0]).toMatchObject({
      message: "ai provider attempt failed",
      payload: {
        event: "ai.provider.attempt_failed",
        runtime: "ai",
        surface: "chat",
        outcome: "retrying",
        provider: "deepseek",
        model: "deepseek-chat",
        errorKind: "rate_limit",
        disposition: "failover_provider",
        nextProvider: "gemini",
        error: expect.objectContaining({
          message: "DeepSeek throttled",
          name: "ChatProviderError",
        }),
      },
    });
    expect(warnCalls[1]).toMatchObject({
      message: "ai provider failover selected",
      payload: {
        event: "ai.provider.failover",
        runtime: "ai",
        surface: "chat",
        outcome: "failover",
        provider: "deepseek",
        model: "deepseek-chat",
        nextProvider: "gemini",
      },
    });
    expect(infoCalls[0]).toMatchObject({
      message: "ai provider request completed",
      payload: {
        event: "ai.provider.request_completed",
        runtime: "ai",
        surface: "chat",
        outcome: "success",
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
    expect(errorCalls).toHaveLength(2);
    expect(errorCalls[0]).toMatchObject({
      message: "ai provider attempt failed",
      payload: {
        event: "ai.provider.attempt_failed",
        outcome: "failed",
        provider: "deepseek",
      },
    });
    expect(errorCalls[1]).toMatchObject({
      message: "ai provider chain failed",
      payload: {
        event: "ai.provider.chain_failed",
        outcome: "do_not_retry",
        terminalProvider: "deepseek",
      },
    });
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

  test("skips unsupported providers when a structured response format is requested", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          gemini: {
            async chat() {
              return createResponse("gemini", "gemini-rewrite", '{"value":"ok"}');
            },
          },
        },
        calls,
      ),
    });

    const response = await manager.chat({
      ...request,
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "rewrite_result",
          schema: {
            type: "object",
          },
          strict: true,
        },
      },
    });

    expect(response).toEqual(createResponse("gemini", "gemini-rewrite", '{"value":"ok"}'));
    expect(calls).toEqual([
      { provider: "gemini", kind: "chat" },
    ]);
  });

  test("fails fast when no configured provider supports the requested response format", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const manager = createChatProviderManager({
      runtimeConfig: {
        ...runtimeConfig,
        providerOrder: ["deepseek", "groq"],
      },
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              return createResponse("deepseek", "deepseek-chat");
            },
          },
          groq: {
            async chat() {
              return createResponse("groq", "llama-3.3-70b-versatile");
            },
          },
        },
        calls,
      ),
    });

    await expect(manager.chat({
      ...request,
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "rewrite_result",
          schema: {
            type: "object",
          },
          strict: true,
        },
      },
    })).rejects.toMatchObject({
      name: "ChatProviderError",
      kind: "response_format",
      disposition: "do_not_retry",
      retryable: false,
      provider: "deepseek",
    });
    expect(calls).toEqual([]);
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

  test("prefers abort over request normalization when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("caller aborted before normalization"));

    const manager = createChatProviderManager({ runtimeConfig });

    await expect(
      manager.chat({ messages: [] }, { signal: controller.signal }),
    ).rejects.toThrow("caller aborted before normalization");
  });

  test("does not resolve runtime config when the caller signal is already aborted", async () => {
    let runtimeConfigCalls = 0;
    const controller = new AbortController();
    controller.abort(new Error("caller aborted before runtime config"));

    const manager = createChatProviderManager({
      runtimeConfig: () => {
        runtimeConfigCalls += 1;
        return runtimeConfig;
      },
    });

    await expect(
      manager.chat(request, { signal: controller.signal }),
    ).rejects.toThrow("caller aborted before runtime config");
    expect(runtimeConfigCalls).toBe(0);
  });

  test("rethrows caller aborts after a provider returns", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const controller = new AbortController();
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async chat() {
              controller.abort(new Error("caller aborted during provider call"));
              return createResponse("deepseek", "deepseek-chat");
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

    await expect(
      manager.chat(request, { signal: controller.signal }),
    ).rejects.toThrow("caller aborted during provider call");
    expect(calls).toEqual([{ provider: "deepseek", kind: "chat" }]);
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
    expect(serializedLogs).toContain("ai.provider.attempt_failed");
    expect(serializedLogs).toContain("ai.provider.request_completed");
  });

  test("continues chat success flow when info logging throws", async () => {
    const consoleWarnCalls: unknown[][] = [];
    const originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      consoleWarnCalls.push(args);
    };

    try {
      const manager = createChatProviderManager({
        runtimeConfig,
        logger: {
          debug() {
            return undefined;
          },
          info() {
            throw new Error("logger info failed");
          },
          warn() {
            throw new Error("unexpected warn call");
          },
          error() {
            throw new Error("unexpected error call");
          },
        },
        resolveAdapter: createResolver(
          {
            deepseek: {
              async chat() {
                return createResponse("deepseek", "deepseek-chat");
              },
            },
          },
          [],
        ),
      });

      await expect(manager.chat(request)).resolves.toEqual(
        createResponse("deepseek", "deepseek-chat"),
      );
      expect(consoleWarnCalls).toEqual([
        [
          "chat manager logging failed",
          {
            level: "info",
            message: "ai provider request completed",
            error: "logger info failed",
          },
        ],
      ]);
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  test("continues failover flow when warn logging throws", async () => {
    const consoleWarnCalls: unknown[][] = [];
    const originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      consoleWarnCalls.push(args);
    };

    try {
      const manager = createChatProviderManager({
        runtimeConfig,
        logger: {
          debug() {
            return undefined;
          },
          info() {
            return undefined;
          },
          warn() {
            throw new Error("logger warn failed");
          },
          error() {
            throw new Error("unexpected error call");
          },
        },
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
          [],
        ),
      });

      await expect(manager.chat(request)).resolves.toEqual(
        createResponse("gemini", "gemini-2.0-flash"),
      );
      expect(consoleWarnCalls).toEqual([
        [
          "chat manager logging failed",
          {
            level: "warn",
            message: "ai provider attempt failed",
            error: "logger warn failed",
          },
        ],
        [
          "chat manager logging failed",
          {
            level: "warn",
            message: "ai provider failover selected",
            error: "logger warn failed",
          },
        ],
      ]);
    } finally {
      console.warn = originalConsoleWarn;
    }
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
      message: "ai provider probes completed",
      payload: {
        event: "ai.provider.probe_completed",
        runtime: "ai",
        surface: "probe",
        outcome: "degraded",
        feature: "startup-check",
        providers: ["gemini", "deepseek"],
        unhealthyProviders: ["gemini"],
      },
    });
  });

  test("continues probe flow when logging throws", async () => {
    const consoleWarnCalls: unknown[][] = [];
    const originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      consoleWarnCalls.push(args);
    };

    try {
      const manager = createChatProviderManager({
        runtimeConfig,
        logger: {
          debug() {
            return undefined;
          },
          info() {
            throw new Error("unexpected info call");
          },
          warn() {
            throw new Error("logger warn failed");
          },
          error() {
            throw new Error("unexpected error call");
          },
        },
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
          },
          [],
        ),
      });

      await expect(
        manager.probeProviders({ providers: ["gemini"] }),
      ).resolves.toEqual([
        {
          provider: "gemini",
          ok: false,
          model: "gemini-2.0-flash",
          error: expect.objectContaining({
            message: "Gemini unavailable",
          }),
        },
      ]);
      expect(consoleWarnCalls).toEqual([
        [
          "chat manager logging failed",
          {
            level: "warn",
            message: "ai provider probes completed",
            error: "logger warn failed",
          },
        ],
      ]);
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  test("continues terminal error flow when error logging throws", async () => {
    const consoleWarnCalls: unknown[][] = [];
    const originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      consoleWarnCalls.push(args);
    };

    try {
      const manager = createChatProviderManager({
        runtimeConfig,
        logger: {
          debug() {
            return undefined;
          },
          info() {
            throw new Error("unexpected info call");
          },
          warn() {
            throw new Error("unexpected warn call");
          },
          error() {
            throw new Error("logger error failed");
          },
        },
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
          },
          [],
        ),
      });

      await expect(manager.chat(request)).rejects.toMatchObject({
        name: "ChatProviderChainError",
        terminalProvider: "deepseek",
        terminalDisposition: "do_not_retry",
      });
      expect(consoleWarnCalls).toEqual([
        [
          "chat manager logging failed",
          {
            level: "error",
            message: "ai provider attempt failed",
            error: "logger error failed",
          },
        ],
        [
          "chat manager logging failed",
          {
            level: "error",
            message: "ai provider chain failed",
            error: "logger error failed",
          },
        ],
      ]);
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  test("stops probeProviders before launching health checks when the caller signal is already aborted", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const controller = new AbortController();
    controller.abort(new Error("probe aborted"));
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
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

    await expect(
      manager.probeProviders({ signal: controller.signal }),
    ).rejects.toThrow("probe aborted");
    expect(calls).toEqual([]);
  });

  test("rethrows probe aborts after a health check returns", async () => {
    const calls: Array<{ provider: ChatProviderName; kind: "chat" | "healthCheck" }> = [];
    const controller = new AbortController();
    const manager = createChatProviderManager({
      runtimeConfig,
      resolveAdapter: createResolver(
        {
          deepseek: {
            async healthCheck() {
              controller.abort(new Error("probe aborted during health check"));
              return {
                provider: "deepseek",
                ok: true,
                model: "deepseek-chat",
              };
            },
          },
          gemini: {
            async healthCheck() {
              return {
                provider: "gemini",
                ok: true,
                model: "gemini-2.0-flash",
              };
            },
          },
        },
        calls,
      ),
    });

    await expect(
      manager.probeProviders({
        providers: ["deepseek", "gemini"],
        signal: controller.signal,
      }),
    ).rejects.toThrow("probe aborted during health check");
    expect(calls).toContainEqual({ provider: "deepseek", kind: "healthCheck" });
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

  test("creates a rewrite-specific manager that honors rewrite runtime config", async () => {
    const calls: ChatProviderName[] = [];
    const manager = createRetrievalRewriteChatProviderManager({
      runtimeConfig: {
        ...runtimeConfig,
        providerOrder: ["groq", "gemini"],
        providers: {
          ...runtimeConfig.providers,
          gemini: {
            ...runtimeConfig.providers.gemini,
            model: "gemini-rewrite",
          },
          groq: {
            ...runtimeConfig.providers.groq,
            model: "groq-rewrite",
          },
        },
      },
      resolveAdapter: (provider) => ({
        provider,
        async chat(_normalizedRequest, config) {
          calls.push(provider);

          return {
            provider,
            model: config.model,
            text: "rewritten query",
            finishReason: "stop",
          };
        },
        async healthCheck() {
          return {
            provider,
            ok: true,
            model: runtimeConfig.providers[provider].model,
          };
        },
      }),
    });

    const response = await manager.chat(request);

    expect(calls).toEqual(["groq"]);
    expect(response.model).toBe("groq-rewrite");
  });
});
