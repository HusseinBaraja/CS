export type CatalogHintLanguage = "ar" | "en";
export type CatalogPrimaryLanguage = CatalogHintLanguage | "mixed" | "unknown";
export type CatalogTermPreservationMode = "user_language" | "catalog_language" | "mixed";

export interface CatalogLanguageHints {
  primaryCatalogLanguage: CatalogPrimaryLanguage;
  supportedLanguages: CatalogHintLanguage[];
  preferredTermPreservation: CatalogTermPreservationMode;
}

export interface CatalogLanguageTextSample {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
}

export const UNKNOWN_CATALOG_LANGUAGE_HINTS: CatalogLanguageHints = {
  primaryCatalogLanguage: "unknown",
  supportedLanguages: [],
  preferredTermPreservation: "user_language",
};

const ARABIC_CHAR_PATTERN = /[\u0600-\u06FF]/g;
const ENGLISH_CHAR_PATTERN = /[A-Za-z]/g;
const MIXED_LANGUAGE_RATIO_THRESHOLD = 0.6;

const countPatternMatches = (value: string, pattern: RegExp): number =>
  value.match(pattern)?.length ?? 0;

const buildSupportedLanguages = (
  primaryCatalogLanguage: CatalogPrimaryLanguage,
  hasArabic: boolean,
  hasEnglish: boolean,
): CatalogHintLanguage[] => {
  if (!hasArabic && !hasEnglish) {
    return [];
  }

  if (primaryCatalogLanguage === "ar") {
    return hasEnglish ? ["ar", "en"] : ["ar"];
  }

  if (primaryCatalogLanguage === "en") {
    return hasArabic ? ["en", "ar"] : ["en"];
  }

  return [
    ...(hasArabic ? ["ar" as const] : []),
    ...(hasEnglish ? ["en" as const] : []),
  ];
};

export const deriveCatalogLanguageHints = (
  samples: CatalogLanguageTextSample[],
): CatalogLanguageHints => {
  let arabicCharCount = 0;
  let englishCharCount = 0;

  for (const sample of samples) {
    for (const value of [
      sample.nameEn,
      sample.nameAr,
      sample.descriptionEn,
      sample.descriptionAr,
    ]) {
      const normalizedValue = value?.trim();
      if (!normalizedValue) {
        continue;
      }

      arabicCharCount += countPatternMatches(normalizedValue, ARABIC_CHAR_PATTERN);
      englishCharCount += countPatternMatches(normalizedValue, ENGLISH_CHAR_PATTERN);
    }
  }

  const hasArabic = arabicCharCount > 0;
  const hasEnglish = englishCharCount > 0;

  if (!hasArabic && !hasEnglish) {
    return {
      ...UNKNOWN_CATALOG_LANGUAGE_HINTS,
      supportedLanguages: [...UNKNOWN_CATALOG_LANGUAGE_HINTS.supportedLanguages],
    };
  }

  let primaryCatalogLanguage: CatalogPrimaryLanguage;
  if (hasArabic && hasEnglish) {
    const dominanceRatio = Math.min(arabicCharCount, englishCharCount)
      / Math.max(arabicCharCount, englishCharCount);
    primaryCatalogLanguage = dominanceRatio >= MIXED_LANGUAGE_RATIO_THRESHOLD
      ? "mixed"
      : (arabicCharCount > englishCharCount ? "ar" : "en");
  } else {
    primaryCatalogLanguage = hasArabic ? "ar" : "en";
  }

  return {
    primaryCatalogLanguage,
    supportedLanguages: buildSupportedLanguages(primaryCatalogLanguage, hasArabic, hasEnglish),
    preferredTermPreservation: primaryCatalogLanguage === "mixed"
      ? "mixed"
      : "catalog_language",
  };
};
