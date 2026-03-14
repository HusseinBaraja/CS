export type ChatLanguage = "ar" | "en";
export type DetectedChatLanguage = "ar" | "en" | "mixed" | "unknown";

export interface LanguageResolutionOptions {
  preferredLanguage?: ChatLanguage;
  defaultLanguage?: ChatLanguage;
}

export interface LanguageDetectionResult {
  classification: DetectedChatLanguage;
  responseLanguage: ChatLanguage;
  arabicCharCount: number;
  englishCharCount: number;
  hasArabic: boolean;
  hasEnglish: boolean;
}

export interface ResolveChatResponseLanguageInput extends LanguageResolutionOptions {
  classification: DetectedChatLanguage;
  arabicCharCount?: number;
  englishCharCount?: number;
}

const DEFAULT_CHAT_LANGUAGE: ChatLanguage = "ar";
const ARABIC_SCRIPT_PATTERN = /\p{Script=Arabic}/u;
const LETTER_PATTERN = /\p{Letter}/u;
const ENGLISH_LETTER_PATTERN = /[A-Za-z]/;

const countLetters = (
  text: string,
): {
  arabicCharCount: number;
  englishCharCount: number;
} => {
  let arabicCharCount = 0;
  let englishCharCount = 0;

  for (const character of text) {
    if (ARABIC_SCRIPT_PATTERN.test(character) && LETTER_PATTERN.test(character)) {
      arabicCharCount += 1;
      continue;
    }

    if (ENGLISH_LETTER_PATTERN.test(character)) {
      englishCharCount += 1;
    }
  }

  return {
    arabicCharCount,
    englishCharCount,
  };
};

export const resolveChatResponseLanguage = (
  input: ResolveChatResponseLanguageInput,
): ChatLanguage => {
  const defaultLanguage = input.defaultLanguage ?? DEFAULT_CHAT_LANGUAGE;

  switch (input.classification) {
    case "ar":
      return "ar";
    case "en":
      return "en";
    case "unknown":
      return input.preferredLanguage ?? defaultLanguage;
    case "mixed":
      if ((input.arabicCharCount ?? 0) > (input.englishCharCount ?? 0)) {
        return "ar";
      }

      if ((input.englishCharCount ?? 0) > (input.arabicCharCount ?? 0)) {
        return "en";
      }

      return input.preferredLanguage ?? defaultLanguage;
  }
};

export const detectChatLanguage = (
  text: string,
  options: LanguageResolutionOptions = {},
): LanguageDetectionResult => {
  const { arabicCharCount, englishCharCount } = countLetters(text);
  const hasArabic = arabicCharCount > 0;
  const hasEnglish = englishCharCount > 0;

  const classification: DetectedChatLanguage = hasArabic && hasEnglish
    ? "mixed"
    : hasArabic
      ? "ar"
      : hasEnglish
        ? "en"
        : "unknown";

  return {
    classification,
    responseLanguage: resolveChatResponseLanguage({
      classification,
      arabicCharCount,
      englishCharCount,
      preferredLanguage: options.preferredLanguage,
      defaultLanguage: options.defaultLanguage,
    }),
    arabicCharCount,
    englishCharCount,
    hasArabic,
    hasEnglish,
  };
};
