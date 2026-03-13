import type { ChatCallOptions, ChatProviderAdapter, ChatRequest, ChatResponse } from './index';

const request: ChatRequest = {
  messages: [
    {
      role: "user",
      content: "hello",
    },
  ],
};

const response: ChatResponse = {
  provider: "deepseek",
  text: "hello",
  finishReason: "stop",
};

const adapter: ChatProviderAdapter = {
  provider: "gemini",
  async chat(normalizedRequest, config) {
    return {
      provider: "gemini",
      model: config.model,
      text: normalizedRequest.messages[0]?.content[0]?.text ?? "",
      finishReason: "stop",
    };
  },
  async healthCheck(config) {
    return {
      provider: "gemini",
      ok: Boolean(config.apiKey),
      model: config.model,
    };
  },
};

const callOptions: ChatCallOptions = {
  timeoutMs: 2_000,
  maxRetries: 1,
};

void request;
void response;
void adapter;
void callOptions;
