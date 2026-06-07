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
    options?: { generateDescriptions?: boolean },
  ): Promise<TranslationResult>;
}

const createAsyncLimiter = (maxConcurrency: number): (<T>(task: () => Promise<T>) => Promise<T>) => {
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = async (): Promise<void> => {
    if (active < maxConcurrency) {
      active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  };

  const release = (): void => {
    active -= 1;
    const next = queue.shift();
    if (next) {
      next();
    }
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
};

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

const createChatCleanProductName = (manager: ChatProviderManager): CleanProductName =>
  async (sourceName, sourceLanguage) => {
    const response = await manager.chat({
      temperature: 0,
      maxOutputTokens: 120,
      messages: [
        {
          role: 'system',
          content: [
            'Clean a catalog product name without inventing facts.',
            'Keep the same language. Do not add prices, availability, dimensions, materials, brands, or claims absent from the source.',
            'Return only the cleaned product name.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Source language: ${sourceLanguage}\nProduct name:\n${sourceName}`,
        },
      ],
    }, {
      logContext: { feature: 'catalog_import_name_cleanup' },
    });

    const cleaned = response.text.trim();
    if (!cleaned) {
      throw new Error('Name cleanup returned empty text');
    }

    return cleaned;
  };

const createChatGenerateProductDescription = (manager: ChatProviderManager): GenerateProductDescription =>
  async (sourceName, cleanedName, sourceLanguage) => {
    const response = await manager.chat({
      temperature: 0,
      maxOutputTokens: 220,
      messages: [
        {
          role: 'system',
          content: [
            'Write a concise catalog description only from the provided product name.',
            'Do not invent prices, availability, dimensions, materials, brands, or business claims.',
            'Return only the description in the source language.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Source language: ${sourceLanguage}\nOriginal name:\n${sourceName}\nCleaned name:\n${cleanedName}`,
        },
      ],
    }, {
      logContext: { feature: 'catalog_import_description_generation' },
    });

    return response.text.trim();
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

  return createCatalogImportTranslator({
    translateText: createChatTranslateText(manager),
    cleanProductName: createChatCleanProductName(manager),
    generateProductDescription: createChatGenerateProductDescription(manager),
  });
};

export const createCatalogImportTranslator = (
  options: {
    translateText: TranslateText;
    cleanProductName?: CleanProductName;
    generateProductDescription?: GenerateProductDescription;
  },
): CatalogImportTranslator => ({
  async translateGroups(groups, sourceLanguage, translatorOptions = {}) {
    let translatedFieldCount = 0;
    let notTranslatedFallbackCount = 0;
    const warnings: CatalogImportTranslationWarning[] = [];
    const targetLanguage = oppositeLanguage(sourceLanguage);
    const limitGroup = createAsyncLimiter(4);
    const shouldGenerateDescriptions = translatorOptions.generateDescriptions !== false;

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
          message: 'Translation failed; stored not_translated',
        });
        return 'not_translated';
      }
    };

    const cleanProductName = async (sourceName: string, productNo: string): Promise<string> => {
      if (!options.cleanProductName) {
        return sourceName;
      }

      try {
        return await options.cleanProductName(sourceName, sourceLanguage);
      } catch {
        warnings.push({
          productNo,
          field: 'productName',
          message: 'Name cleanup failed; stored source name',
        });
        return sourceName;
      }
    };

    const generateDescription = async (
      sourceName: string,
      cleanedName: string,
      productNo: string,
    ): Promise<string | undefined> => {
      if (!options.generateProductDescription) {
        return undefined;
      }

      try {
        const generated = await options.generateProductDescription(sourceName, cleanedName, sourceLanguage);
        return generated.trim() || undefined;
      } catch {
        warnings.push({
          productNo,
          field: 'description',
          message: 'Description generation failed; stored empty description',
        });
        return undefined;
      }
    };

    const translatedGroups = await Promise.all(groups.map((group) => limitGroup(async (): Promise<TranslatedImportGroup> => {
      const firstRow = group.rows[0];
      if (!firstRow) {
        throw new Error(`Empty product group: ${group.productNo}`);
      }
      const limitUnit = createAsyncLimiter(8);
      const cleanedProductName = await cleanProductName(firstRow.productName, group.productNo);
      const sourceDescription = firstRow.description
        ?? (shouldGenerateDescriptions
          ? await generateDescription(firstRow.productName, cleanedProductName, group.productNo)
          : undefined);

      const [category, productName, description] = await Promise.all([
        translate(firstRow.categoryName, 'categoryName', group.productNo),
        translate(cleanedProductName, 'productName', group.productNo),
        sourceDescription ? translate(sourceDescription, 'description', group.productNo) : undefined,
      ]);

      const units = await Promise.all(group.rows.map((row, index) => limitUnit(async () => {
        const translatedLabel = await translate(row.unitLabel, 'unitLabel', group.productNo);
        return {
          ...(sourceLanguage === 'en'
            ? { labelEn: row.unitLabel, labelAr: translatedLabel }
            : { labelEn: translatedLabel, labelAr: row.unitLabel }),
          price: row.price,
          sortOrder: index,
        };
      })));

      return {
        productNo: group.productNo,
        category: sourceTarget(firstRow.categoryName, category, sourceLanguage),
        productName: sourceTarget(cleanedProductName, productName, sourceLanguage),
        ...(sourceDescription && description ? { description: sourceTarget(sourceDescription, description, sourceLanguage) } : {}),
        units,
      };
    })));

    return {
      groups: translatedGroups,
      translatedFieldCount,
      notTranslatedFallbackCount,
      warnings,
    };
  },
});
