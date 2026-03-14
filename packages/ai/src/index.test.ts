import { describe, expect, test } from 'bun:test';
import {
  createChatProviderManager,
  detectChatLanguage,
  getChatProviderAdapter,
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
  });

  test("exports language policy helpers", () => {
    expect(typeof detectChatLanguage).toBe("function");
    expect(typeof resolveChatResponseLanguage).toBe("function");
  });
});
