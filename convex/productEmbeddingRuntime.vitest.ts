/// <reference types='vite/client' />
import { describe, expect, it, vi } from 'vitest';
import type { Id } from './_generated/dataModel';

const { generateGeminiEmbeddings } = vi.hoisted(() => ({
  generateGeminiEmbeddings: vi.fn(),
}));

vi.mock('../packages/ai/src/embeddings', () => ({
  GEMINI_EMBEDDING_DIMENSIONS: 768,
  generateGeminiEmbeddings,
}));

import { buildProductEmbeddingPayload } from './productEmbeddingRuntime';

const COMPANY_ID = 'company_1' as Id<'companies'>;
const CATEGORY_ID = 'category_1' as Id<'categories'>;

describe('product embedding runtime', () => {
  it('includes product number as a SKU token in English and Arabic embedding text', async () => {
    generateGeminiEmbeddings.mockResolvedValue([
      [1, 2, 3],
      [4, 5, 6],
    ]);

    const payload = await buildProductEmbeddingPayload({
      companyId: COMPANY_ID,
      categoryId: CATEGORY_ID,
      productNo: 'SKU-500',
      nameEn: 'Paper cups',
      nameAr: 'اكواب ورقية',
    });

    expect(payload.englishText).toContain('language:en');
    expect(payload.englishText).toContain('sku:SKU-500');
    expect(payload.arabicText).toContain('language:ar');
    expect(payload.arabicText).toContain('sku:SKU-500');
    expect(generateGeminiEmbeddings).toHaveBeenCalledWith(
      [payload.englishText, payload.arabicText],
      {
        model: 'gemini-embedding-001',
        outputDimensionality: 768,
      },
    );
  });
});
