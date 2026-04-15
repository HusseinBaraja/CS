import { describe, expect, test } from 'bun:test';
import { deriveCatalogLanguageHints } from './catalogLanguageHints';

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
});
