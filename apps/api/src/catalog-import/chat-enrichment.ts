import type { ChatProviderManager } from '@cs/ai';
import type { CleanProductName, GenerateProductDescription } from './translationTypes';

export const createChatCleanProductName = (manager: ChatProviderManager): CleanProductName =>
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

export const createChatGenerateProductDescription = (
  manager: ChatProviderManager,
): GenerateProductDescription =>
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

    const text = response.text.trim();
    if (!text) {
      const snippet = response.text.slice(0, 120);
      throw new Error(
        `Empty model output for chat enrichment (provider=${response.provider}, model=${response.model ?? 'unknown'}, finishReason=${response.finishReason}, responseId=${response.responseId ?? 'unknown'}, snippet=${JSON.stringify(snippet)})`,
      );
    }

    return text;
  };
