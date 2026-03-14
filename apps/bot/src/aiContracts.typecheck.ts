import type {
  ChatLanguage,
  ChatProviderAdapter,
  ChatRequest,
  ChatResponse,
  LanguageDetectionResult,
} from '@cs/ai';
import { detectChatLanguage } from '@cs/ai';

const request: ChatRequest = {
  messages: [
    {
      role: "user",
      content: "bootstrap",
    },
  ],
};

const response: ChatResponse = {
  provider: "groq",
  text: "ready",
  finishReason: "stop",
};

const adapter: ChatProviderAdapter = {
  provider: "groq",
  async chat(normalizedRequest) {
    return {
      provider: "groq",
      text: normalizedRequest.messages[0]?.content[0]?.text ?? "",
      finishReason: "stop",
    };
  },
  async healthCheck() {
    return {
      provider: "groq",
      ok: true,
    };
  },
};

const language: ChatLanguage = "ar";
const detection: LanguageDetectionResult = detectChatLanguage("مرحبا", {
  preferredLanguage: language,
});

void request;
void response;
void adapter;
void language;
void detection;
