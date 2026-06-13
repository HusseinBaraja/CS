import type { CatalogImportSourceLanguage, CatalogImportTranslationWarning } from '../services/catalogImports';
import type { ParsedCatalogImportGroup } from './workbookParser';

export interface TranslatedImportGroup {
  productNo: string;
  category: { en: string; ar: string };
  productName: { en: string; ar: string };
  description?: { en: string; ar: string };
  currency?: string;
  units: Array<{ labelEn: string; labelAr: string; price: number; sortOrder?: number }>;
}

export interface TranslationResult {
  groups: TranslatedImportGroup[];
  translatedFieldCount: number;
  notTranslatedFallbackCount: number;
  warnings: CatalogImportTranslationWarning[];
}

export type TranslateText = (
  text: string,
  input: {
    sourceLanguage: CatalogImportSourceLanguage;
    targetLanguage: CatalogImportSourceLanguage;
    field: string;
    productNo: string;
  },
) => Promise<string>;

export type CleanProductName = (
  sourceName: string,
  sourceLanguage: CatalogImportSourceLanguage,
) => Promise<string>;

export type GenerateProductDescription = (
  sourceName: string,
  cleanedName: string,
  sourceLanguage: CatalogImportSourceLanguage,
) => Promise<string>;

export interface CatalogImportTranslator {
  translateGroups(
    groups: ParsedCatalogImportGroup[],
    sourceLanguage: CatalogImportSourceLanguage,
    options?: { generateDescriptions?: boolean; translateDescriptions?: boolean },
  ): Promise<TranslationResult>;
}
