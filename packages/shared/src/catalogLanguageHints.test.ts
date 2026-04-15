import { describe, expect, test } from 'bun:test';
import {
  deriveCatalogLanguageHints,
  UNKNOWN_CATALOG_LANGUAGE_HINTS,
} from './catalogLanguageHints';

describe("deriveCatalogLanguageHints", () => {
  test("returns English-only hints when only English catalog text is present", () => {
    expect(
      deriveCatalogLanguageHints([
        {
          nameEn: "Burger Box",
          descriptionEn: "Disposable meal packaging",
        },
      ]),
    ).toEqual({
      primaryCatalogLanguage: "en",
      supportedLanguages: ["en"],
      preferredTermPreservation: "catalog_language",
    });
  });

  test("returns Arabic-primary hints when Arabic text clearly dominates", () => {
    expect(
      deriveCatalogLanguageHints([
        {
          nameEn: "Box",
          nameAr: "علبة برجر",
          descriptionAr: "علبة عربية طويلة للوصف مع تفاصيل إضافية عن المنتج",
        },
      ]),
    ).toEqual({
      primaryCatalogLanguage: "ar",
      supportedLanguages: ["ar", "en"],
      preferredTermPreservation: "catalog_language",
    });
  });

  test("returns mixed hints when both scripts are materially present", () => {
    expect(
      deriveCatalogLanguageHints([
        {
          nameEn: "Burger Box",
          nameAr: "علبة برجر",
        },
      ]),
    ).toEqual({
      primaryCatalogLanguage: "mixed",
      supportedLanguages: ["ar", "en"],
      preferredTermPreservation: "mixed",
    });
  });

  test("returns unknown hints when no catalog text is available", () => {
    expect(deriveCatalogLanguageHints([])).toEqual({
      primaryCatalogLanguage: "unknown",
      supportedLanguages: [],
      preferredTermPreservation: "user_language",
    });
  });

  test("returns a fresh unknown hints object for each empty result", () => {
    const hints = deriveCatalogLanguageHints([]);

    expect(hints).toEqual(UNKNOWN_CATALOG_LANGUAGE_HINTS);
    expect(hints).not.toBe(UNKNOWN_CATALOG_LANGUAGE_HINTS);
    expect(hints.supportedLanguages).not.toBe(UNKNOWN_CATALOG_LANGUAGE_HINTS.supportedLanguages);
  });
});
