import {
  type ChatCallOptions,
  type ChatLanguage,
  type ChatManagerCallOptions,
  type ChatProviderAdapter,
  type ChatProviderAttemptFailure,
  type ChatProviderProbeOptions,
  type ChatRequest,
  type ChatResponse,
  type DetectedChatLanguage,
  type LanguageDetectionResult,
  type LanguageResolutionOptions,
  createChatProviderManager,
  detectChatLanguage,
  resolveChatResponseLanguage,
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

const language: ChatLanguage = "ar";
const detectedLanguage: DetectedChatLanguage = "mixed";
const languageOptions: LanguageResolutionOptions = {
  preferredLanguage: "en",
};
const detectionResult: LanguageDetectionResult = detectChatLanguage("hello", languageOptions);
const responseLanguage = resolveChatResponseLanguage({
  classification: detectedLanguage,
  arabicCharCount: 1,
  englishCharCount: 2,
  preferredLanguage: language,
});

const manager = createChatProviderManager();

void request;
void response;
void adapter;
void callOptions;
void managerCallOptions;
void probeOptions;
void failure;
void language;
void detectedLanguage;
void languageOptions;
void detectionResult;
void responseLanguage;
void manager;
