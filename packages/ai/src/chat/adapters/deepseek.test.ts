import { afterEach, describe, expect, test } from 'bun:test';
import { setDeepSeekClientFactoryForTests } from './clients/deepseekClientFactory';
import { deepseekChatProviderAdapter } from './deepseek';

const request = {
  messages: [
    {
      role: "system" as const,
      content: [{ type: "text" as const, text: "Be concise." }],
    },
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "Hello" }],
    },
  ],
};

const config = {
  apiKey: "deepseek-key",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.example/v1",
};

let resetDeepSeekFactory: (() => void) | null = null;

afterEach(() => {
  resetDeepSeekFactory?.();
  resetDeepSeekFactory = null;
});

describe("deepseekChatProviderAdapter", () => {
  test("maps successful responses into the shared contract", async () => {
    const capturedRequests: unknown[] = [];

    resetDeepSeekFactory = setDeepSeekClientFactoryForTests(() => ({
      chat: {
        completions: {
          async create(params) {
            capturedRequests.push(params);
            return {
              id: "resp_123",
              model: "deepseek-chat",
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: "Hi there",
                  },
                },
              ],
              usage: {
                prompt_tokens: 12,
                completion_tokens: 5,
                total_tokens: 17,
              },
            };
          },
        },
      },
    }));

    const response = await deepseekChatProviderAdapter.chat(request, config);

    expect(capturedRequests).toEqual([
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Be concise." },
          { role: "user", content: "Hello" },
        ],
        stream: false,
      },
    ]);
    expect(response).toEqual({
      provider: "deepseek",
      model: "deepseek-chat",
      text: "Hi there",
      finishReason: "stop",
      usage: {
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
      },
      responseId: "resp_123",
    });
  });

  test("retries transient failures before succeeding", async () => {
    let attempts = 0;

    resetDeepSeekFactory = setDeepSeekClientFactoryForTests(() => ({
      chat: {
        completions: {
          async create() {
            attempts += 1;
            if (attempts === 1) {
              throw {
                name: "InternalServerError",
                status: 503,
                message: "temporary outage",
              };
            }

            return {
              id: "resp_456",
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: "Recovered",
                  },
                },
              ],
            };
          },
        },
      },
    }));

    const response = await deepseekChatProviderAdapter.chat(request, config, {
      maxRetries: 1,
    });

    expect(attempts).toBe(2);
    expect(response.text).toBe("Recovered");
  });

  test("classifies authentication failures without retrying", async () => {
    resetDeepSeekFactory = setDeepSeekClientFactoryForTests(() => ({
      chat: {
        completions: {
          async create() {
            throw {
              name: "AuthenticationError",
              status: 401,
              message: "bad key",
            };
          },
        },
      },
    }));

    await expect(
      deepseekChatProviderAdapter.chat(request, config),
    ).rejects.toMatchObject({
      kind: "authentication",
      disposition: "do_not_retry",
      retryable: false,
    });
  });

  test("reports health-check misconfiguration without throwing", async () => {
    const health = await deepseekChatProviderAdapter.healthCheck({
      model: "deepseek-chat",
    });

    expect(health).toMatchObject({
      provider: "deepseek",
      ok: false,
      model: "deepseek-chat",
      error: {
        kind: "configuration",
      },
    });
  });
});
