import { describe, expect, test } from 'bun:test';
import type { ChatProviderManager } from '@cs/ai';
import { createChatGenerateProductDescription } from './chat-enrichment';

const createManager = (text: string): ChatProviderManager => ({
  async chat() {
    return {
      provider: 'gemini',
      model: 'gemini-test',
      text,
      finishReason: 'stop',
      responseId: 'response-1',
    };
  },
  async probeProviders() {
    return [];
  },
});

describe('catalog import chat enrichment', () => {
  test('rejects empty generated descriptions with response context', async () => {
    const generateDescription = createChatGenerateProductDescription(createManager('   '));

    await expect(generateDescription('Source name', 'Cleaned name', 'en')).rejects.toThrow(
      'Empty model output for chat enrichment (provider=gemini, model=gemini-test, finishReason=stop, responseId=response-1, snippet="   ")',
    );
  });

  test('returns trimmed generated descriptions', async () => {
    const generateDescription = createChatGenerateProductDescription(createManager('  Useful description  '));

    await expect(generateDescription('Source name', 'Cleaned name', 'en')).resolves.toBe('Useful description');
  });
});
