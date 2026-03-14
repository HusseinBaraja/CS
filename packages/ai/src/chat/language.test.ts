import { describe, expect, test } from 'bun:test';
import {
  detectChatLanguage,
  resolveChatResponseLanguage,
} from './language';

describe("language policy", () => {
  test("classifies Arabic-only input", () => {
    expect(detectChatLanguage("مرحبا كيف الحال")).toEqual({
      classification: "ar",
      responseLanguage: "ar",
      arabicCharCount: 13,
      englishCharCount: 0,
      hasArabic: true,
      hasEnglish: false,
    });
  });

  test("classifies English-only input", () => {
    expect(detectChatLanguage("Hello there")).toEqual({
      classification: "en",
      responseLanguage: "en",
      arabicCharCount: 0,
      englishCharCount: 10,
      hasArabic: false,
      hasEnglish: true,
    });
  });

  test("classifies mixed input with Arabic dominant", () => {
    expect(detectChatLanguage("مرحباا box")).toEqual({
      classification: "mixed",
      responseLanguage: "ar",
      arabicCharCount: 6,
      englishCharCount: 3,
      hasArabic: true,
      hasEnglish: true,
    });
  });

  test("classifies mixed input with English dominant", () => {
    expect(detectChatLanguage("burger مرح")).toEqual({
      classification: "mixed",
      responseLanguage: "en",
      arabicCharCount: 3,
      englishCharCount: 6,
      hasArabic: true,
      hasEnglish: true,
    });
  });

  test("uses the preferred language for exact mixed ties", () => {
    expect(
      detectChatLanguage("abc مرح", {
        preferredLanguage: "en",
      }),
    ).toMatchObject({
      classification: "mixed",
      responseLanguage: "en",
      arabicCharCount: 3,
      englishCharCount: 3,
    });
  });

  test("defaults numeric-only input to Arabic", () => {
    expect(detectChatLanguage("12345 67890")).toEqual({
      classification: "unknown",
      responseLanguage: "ar",
      arabicCharCount: 0,
      englishCharCount: 0,
      hasArabic: false,
      hasEnglish: false,
    });
  });

  test("ignores emoji and punctuation during classification", () => {
    expect(detectChatLanguage("...؟؟؟ 😊")).toEqual({
      classification: "unknown",
      responseLanguage: "ar",
      arabicCharCount: 0,
      englishCharCount: 0,
      hasArabic: false,
      hasEnglish: false,
    });
  });

  test("resolveChatResponseLanguage prefers the dominant script", () => {
    expect(
      resolveChatResponseLanguage({
        classification: "mixed",
        arabicCharCount: 7,
        englishCharCount: 2,
      }),
    ).toBe("ar");
  });
});
