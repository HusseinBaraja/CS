import {
  createChatProviderManager,
  createChatRuntimeConfig,
  type ChatProviderManager,
} from '@cs/ai';
import type { CatalogImportSourceLanguage, CatalogImportTranslationWarning } from '../services/catalogImports';
import type { ParsedCatalogImportGroup } from './workbookParser';

export interface TranslatedImportGroup {
  productNo: string;
  category: { en: string; ar: string };
  productName: { en: string; ar: string };
  description?: { en: string; ar: string };
  price?: number;
  currency?: string;
  variants: Array<{ labelEn: string; labelAr: string; price?: number }>;
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

export interface CatalogImportTranslator {
  translateGroups(groups: ParsedCatalogImportGroup[], sourceLanguage: CatalogImportSourceLanguage): Promise<TranslationResult>;
}

const oppositeLanguage = (language: CatalogImportSourceLanguage): CatalogImportSourceLanguage =>
  language === 'en' ? 'ar' : 'en';

const sourceTarget = (
  sourceValue: string,
  translatedValue: string,
  sourceLanguage: CatalogImportSourceLanguage,
): { en: string; ar: string } =>
  sourceLanguage === 'en'
    ? { en: sourceValue, ar: translatedValue }
    : { en: translatedValue, ar: sourceValue };

const createChatTranslateText = (manager: ChatProviderManager): TranslateText =>
  async (text, input) => {
    const response = await manager.chat({
      temperature: 0,
      maxOutputTokens: 500,
      messages: [
        {
          role: 'system',
          content: [
            'Translate catalog text between Arabic and English.',
            'Return only the translated text. Do not add quotes, markdown, explanations, or extra fields.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Source language: ${input.sourceLanguage}\nTarget language: ${input.targetLanguage}\nText:\n${text}`,
        },
      ],
    }, {
      logContext: {
        feature: 'catalog_import_translation',
      },
    });

    const translated = response.text.trim();
    if (!translated) {
      throw new Error('Translation returned empty text');
    }

    return translated;
  };

export const createDefaultCatalogImportTranslator = (): CatalogImportTranslator => {
  const baseConfig = createChatRuntimeConfig();
  const manager = createChatProviderManager({
    runtimeConfig: {
      ...baseConfig,
      providerOrder: ['gemini', 'deepseek'],
      providers: {
        ...baseConfig.providers,
        gemini: {
          ...baseConfig.providers.gemini,
          model: 'gemini-2.5-flash-lite',
        },
      },
    },
  });

  return createCatalogImportTranslator({ translateText: createChatTranslateText(manager) });
};

export const createCatalogImportTranslator = (
  options: { translateText: TranslateText },
): CatalogImportTranslator => ({
  async translateGroups(groups, sourceLanguage) {
    let translatedFieldCount = 0;
    let notTranslatedFallbackCount = 0;
    const warnings: CatalogImportTranslationWarning[] = [];
    const targetLanguage = oppositeLanguage(sourceLanguage);

    const translate = async (text: string, field: string, productNo: string): Promise<string> => {
      try {
        const translated = await options.translateText(text, {
          sourceLanguage,
          targetLanguage,
          field,
          productNo,
        });
        translatedFieldCount += 1;
        return translated;
      } catch {
        notTranslatedFallbackCount += 1;
        warnings.push({
          productNo,
          field,
          message: 'Gemini and DeepSeek translation failed; stored not_translated',
        });
        return 'not_translated';
      }
    };

    const translatedGroups = await Promise.all(groups.map(async (group): Promise<TranslatedImportGroup> => {
      const firstRow = group.rows[0];
      if (!firstRow) {
        throw new Error(`Empty product group: ${group.productNo}`);
      }

      const [category, productName, description] = await Promise.all([
        translate(firstRow.categoryName, 'categoryName', group.productNo),
        translate(firstRow.productName, 'productName', group.productNo),
        firstRow.description ? translate(firstRow.description, 'description', group.productNo) : undefined,
      ]);

      const variants = await Promise.all(group.rows.map(async (row) => {
        const label = row.variantLabel ?? row.productName;
        const translatedLabel = await translate(label, 'variantLabel', group.productNo);
        return {
          ...(sourceLanguage === 'en'
            ? { labelEn: label, labelAr: translatedLabel }
            : { labelEn: translatedLabel, labelAr: label }),
          ...(row.variantPrice !== undefined ? { price: row.variantPrice } : {}),
        };
      }));

      return {
        productNo: group.productNo,
        category: sourceTarget(firstRow.categoryName, category, sourceLanguage),
        productName: sourceTarget(firstRow.productName, productName, sourceLanguage),
        ...(firstRow.description && description ? { description: sourceTarget(firstRow.description, description, sourceLanguage) } : {}),
        ...(firstRow.price !== undefined ? { price: firstRow.price } : {}),
        ...(firstRow.currency ? { currency: firstRow.currency } : {}),
        variants,
      };
    }));

    return {
      groups: translatedGroups,
      translatedFieldCount,
      notTranslatedFallbackCount,
      warnings,
    };
  },
});
