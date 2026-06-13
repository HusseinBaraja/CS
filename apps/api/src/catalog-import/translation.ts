import {
  createChatProviderManager,
  createChatRuntimeConfig,
  type ChatProviderManager,
} from '@cs/ai';
import type { CatalogImportSourceLanguage, CatalogImportTranslationWarning } from '../services/catalogImports';
import { createAsyncLimiter } from './asyncLimiter';
import { createChatCleanProductName, createChatGenerateProductDescription } from './chat-enrichment';
import type {
  CatalogImportTranslator,
  CleanProductName,
  GenerateProductDescription,
  TranslatedImportGroup,
  TranslateText,
} from './translationTypes';
import { translateGroupUnits } from './unit-translation';
import type { ParsedCatalogImportGroup } from './workbookParser';

export type {
  CatalogImportTranslator,
  CleanProductName,
  GenerateProductDescription,
  TranslatedImportGroup,
  TranslationResult,
  TranslateText,
} from './translationTypes';

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

const getSourceDescription = (group: ParsedCatalogImportGroup): string | undefined => {
  const descriptions = group.rows
    .map((row) => row.description?.trim())
    .filter((description): description is string => Boolean(description));
  const uniqueDescriptions = new Set(descriptions);

  if (uniqueDescriptions.size > 1) {
    throw new Error(`VALIDATION_FAILED: Conflicting descriptions for product ${group.productNo}`);
  }

  return descriptions[0];
};

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
    const shouldTranslateDescriptions = translatorOptions.translateDescriptions !== false;

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
      const cleanedProductName = await cleanProductName(firstRow.productName, group.productNo);
      const sourceDescription = getSourceDescription(group)
        ?? (shouldGenerateDescriptions
          ? await generateDescription(firstRow.productName, cleanedProductName, group.productNo)
          : undefined);

      const [category, productName, translatedDescription] = await Promise.all([
        translate(firstRow.categoryName, 'categoryName', group.productNo),
        translate(cleanedProductName, 'productName', group.productNo),
        sourceDescription && shouldTranslateDescriptions
          ? translate(sourceDescription, 'description', group.productNo)
          : undefined,
      ]);
      const description = sourceDescription
        ? sourceTarget(sourceDescription, translatedDescription ?? 'not_translated', sourceLanguage)
        : undefined;

      const units = await translateGroupUnits({
        group,
        sourceLanguage,
        translate,
      });

      return {
        productNo: group.productNo,
        category: sourceTarget(firstRow.categoryName, category, sourceLanguage),
        productName: sourceTarget(cleanedProductName, productName, sourceLanguage),
        ...(description ? { description } : {}),
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
