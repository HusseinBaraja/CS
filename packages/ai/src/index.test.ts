import { describe, expect, test } from 'bun:test';
import { createChatProviderManager, getChatProviderAdapter } from './index';

describe("@cs/ai public API", () => {
  test("exports getChatProviderAdapter for all supported providers", () => {
    expect(getChatProviderAdapter("deepseek").provider).toBe("deepseek");
    expect(getChatProviderAdapter("gemini").provider).toBe("gemini");
    expect(getChatProviderAdapter("groq").provider).toBe("groq");
  });

  test("exports createChatProviderManager", () => {
    expect(typeof createChatProviderManager).toBe("function");
  });
});
