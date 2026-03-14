import { afterEach, describe, expect, test } from 'bun:test';
import { setGroqClientFactoryForTests } from './clients/groqClientFactory';
import { groqChatProviderAdapter } from './groq';

const request = {
  messages: [
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "Use a tool if needed." }],
    },
  ],
};

const config = {
  apiKey: "groq-key",
  model: "llama-3.3-70b-versatile",
};

let resetGroqFactory: (() => void) | null = null;

afterEach(() => {
  resetGroqFactory?.();
  resetGroqFactory = null;
});

describe("groqChatProviderAdapter", () => {
  test("normalizes tool-call responses without text", async () => {
    resetGroqFactory = setGroqClientFactoryForTests(() => ({
      chat: {
        completions: {
          async create() {
            return {
              id: "groq_resp",
              model: "llama-3.3-70b-versatile",
              choices: [
                {
                  finish_reason: "tool_calls",
                  message: {
                    content: null,
                    tool_calls: [{ id: "tool_1" }],
                  },
                },
              ],
            };
          },
        },
      },
    }));

    const response = await groqChatProviderAdapter.chat(request, config);

    expect(response).toEqual({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      text: "",
      finishReason: "tool_calls",
      usage: undefined,
      responseId: "groq_resp",
    });
  });

  test("returns unavailable health when the provider call fails", async () => {
    resetGroqFactory = setGroqClientFactoryForTests(() => ({
      chat: {
        completions: {
          async create() {
            throw {
              name: "InternalServerError",
              status: 503,
              message: "service unavailable",
            };
          },
        },
      },
    }));

    const health = await groqChatProviderAdapter.healthCheck(config);

    expect(health).toMatchObject({
      provider: "groq",
      ok: false,
      model: "llama-3.3-70b-versatile",
      error: {
        kind: "unavailable",
        disposition: "failover_provider",
      },
    });
  });
});
