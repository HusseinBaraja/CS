import {
  type ChatCallOptions,
  type ChatManagerCallOptions,
  type ChatProviderAdapter,
  type ChatProviderAttemptFailure,
  type ChatProviderProbeOptions,
  type ChatRequest,
  type ChatResponse,
  createChatProviderManager,
} from './index';

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

const managerCallOptions: ChatManagerCallOptions = {
  timeoutMs: 2_000,
  maxRetriesPerProvider: 1,
  logContext: {
    companyId: "company-1",
  },
};

const probeOptions: ChatProviderProbeOptions = {
  providers: ["deepseek", "gemini"],
  timeoutMs: 2_000,
  maxRetries: 1,
};

const failure: ChatProviderAttemptFailure = {
  provider: "gemini",
  kind: "unavailable",
  disposition: "failover_provider",
  message: "provider unavailable",
};

const manager = createChatProviderManager();

void request;
void response;
void adapter;
void callOptions;
void managerCallOptions;
void probeOptions;
void failure;
void manager;
