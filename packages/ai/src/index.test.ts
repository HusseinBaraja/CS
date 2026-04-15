import { describe, expect, test } from 'bun:test';
import {
  buildGroundedChatPrompt,
  createChatProviderManager,
  createRetrievalRewriteChatProviderManager,
  createRetrievalRewriteRuntimeConfig,
  detectChatLanguage,
  getAllowedActions,
  getChatProviderAdapter,
  parseAssistantStructuredOutput,
  resolveChatResponseLanguage,
} from './index';

describe("@cs/ai public API", () => {
  test("exports getChatProviderAdapter for all supported providers", () => {
    expect(getChatProviderAdapter("deepseek").provider).toBe("deepseek");
    expect(getChatProviderAdapter("gemini").provider).toBe("gemini");
    expect(getChatProviderAdapter("groq").provider).toBe("groq");
  });

  test("exports createChatProviderManager", () => {
    expect(typeof createChatProviderManager).toBe("function");
    expect(typeof createRetrievalRewriteChatProviderManager).toBe("function");
    expect(typeof createRetrievalRewriteRuntimeConfig).toBe("function");
  });

  test("exports language policy helpers", () => {
    expect(typeof detectChatLanguage).toBe("function");
    expect(typeof resolveChatResponseLanguage).toBe("function");
  });

  test("exports prompt policy helpers", () => {
    expect(typeof buildGroundedChatPrompt).toBe("function");
  });

  test("exports structured output helpers", () => {
    expect(typeof parseAssistantStructuredOutput).toBe("function");
    expect(typeof getAllowedActions).toBe("function");
  });
});
