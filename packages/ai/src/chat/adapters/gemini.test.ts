import { afterEach, describe, expect, test } from 'bun:test';
import { setGeminiClientFactoryForTests } from '../../gemini/clientFactory';
import type { GeminiClient } from '../../gemini/types';
import { geminiChatProviderAdapter } from './gemini';

const config = {
  apiKey: "gemini-key",
  model: "gemini-2.0-flash",
};

let resetGeminiFactory: (() => void) | null = null;

afterEach(() => {
  resetGeminiFactory?.();
  resetGeminiFactory = null;
});

describe("geminiChatProviderAdapter", () => {
  test("extracts system instruction and normalizes Gemini responses", async () => {
    const capturedRequests: unknown[] = [];

    resetGeminiFactory = setGeminiClientFactoryForTests(() => ({
      models: {
        async embedContent() {
          throw new Error("not used");
        },
        async generateContent(params: Parameters<NonNullable<GeminiClient["models"]["generateContent"]>>[0]) {
          capturedRequests.push(params);
          return {
            modelVersion: "gemini-2.0-flash",
            responseId: "gem_resp",
            text: "Hello from Gemini",
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [{ text: "Hello from Gemini" }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 9,
              candidatesTokenCount: 4,
              totalTokenCount: 13,
            },
          };
        },
      },
    }));

    const response = await geminiChatProviderAdapter.chat(
      {
        messages: [
          {
            role: "system",
            content: [{ type: "text", text: "Answer in English." }],
          },
          {
            role: "system",
            content: [{ type: "text", text: "Stay concise." }],
          },
          {
            role: "user",
            content: [{ type: "text", text: "Hi" }],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "Previous reply" }],
          },
        ],
      },
      config,
    );

    expect(capturedRequests).toEqual([
      {
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: "Hi" }],
          },
          {
            role: "model",
            parts: [{ text: "Previous reply" }],
          },
        ],
        config: {
          systemInstruction: "Answer in English.\n\nStay concise.",
        },
        abortSignal: expect.any(AbortSignal),
      },
    ]);
    expect(response).toEqual({
      provider: "gemini",
      model: "gemini-2.0-flash",
      text: "Hello from Gemini",
      finishReason: "stop",
      usage: {
        inputTokens: 9,
        outputTokens: 4,
        totalTokens: 13,
      },
      responseId: "gem_resp",
    });
  });

  test("rejects system-only requests as invalid", async () => {
    await expect(
      geminiChatProviderAdapter.chat(
        {
          messages: [
            {
              role: "system",
              content: [{ type: "text", text: "Only instructions" }],
            },
          ],
        },
        config,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_request",
      disposition: "do_not_retry",
    });
  });

  test("counts empty-text health checks as healthy when the provider accepts the call", async () => {
    resetGeminiFactory = setGeminiClientFactoryForTests(() => ({
      models: {
        async embedContent() {
          throw new Error("not used");
        },
        async generateContent() {
          return {
            modelVersion: "gemini-2.0-flash",
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [],
                },
              },
            ],
          };
        },
      },
    }));

    const health = await geminiChatProviderAdapter.healthCheck(config);

    expect(health).toMatchObject({
      provider: "gemini",
      ok: true,
      model: "gemini-2.0-flash",
    });
  });

  test("retries retryable Gemini failures before succeeding", async () => {
    let attempts = 0;

    resetGeminiFactory = setGeminiClientFactoryForTests(() => ({
      models: {
        async embedContent() {
          throw new Error("not used");
        },
        async generateContent() {
          attempts += 1;
          if (attempts === 1) {
            throw {
              status: 429,
              message: "rate limited",
            };
          }

          return {
            modelVersion: "gemini-2.0-flash",
            text: "Recovered",
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [{ text: "Recovered" }],
                },
              },
            ],
          };
        },
      },
    }));

    const response = await geminiChatProviderAdapter.chat(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
      },
      config,
      { maxRetries: 1 },
    );

    expect(attempts).toBe(2);
    expect(response.text).toBe("Recovered");
  });
});
