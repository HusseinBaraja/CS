/// <reference types='vite/client' />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from './_generated/dataModel';

const { generateGeminiEmbeddings } = vi.hoisted(() => ({
  generateGeminiEmbeddings: vi.fn(),
}));

vi.mock('@cs/ai/embeddings', () => ({
  GEMINI_EMBEDDING_DIMENSIONS: 768,
  generateGeminiEmbeddings,
}));

import { buildProductEmbeddingPayload } from './productEmbeddingRuntime';

const COMPANY_ID = 'company_1' as Id<'companies'>;
const CATEGORY_ID = 'category_1' as Id<'categories'>;

describe('product embedding runtime', () => {
  beforeEach(() => {
    generateGeminiEmbeddings.mockReset();
  });

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

  it('rejects products with no meaningful product or variant text before embedding', async () => {
    await expect(
      buildProductEmbeddingPayload({
        companyId: COMPANY_ID,
        categoryId: CATEGORY_ID,
        nameEn: ' ',
        nameAr: '',
        descriptionEn: ' ',
        descriptionAr: '',
      }, [
        {
          id: 'variant_1',
          productId: 'product_1',
          labelEn: ' ',
          price: 10,
        },
      ]),
    ).rejects.toThrow(
      'VALIDATION_FAILED: product embedding requires product or variant descriptive text',
    );

    expect(generateGeminiEmbeddings).not.toHaveBeenCalled();
  });

  it('allows variant labels to provide meaningful embedding text', async () => {
    generateGeminiEmbeddings.mockResolvedValue([
      [1, 2, 3],
      [4, 5, 6],
    ]);

    const payload = await buildProductEmbeddingPayload({
      companyId: COMPANY_ID,
      categoryId: CATEGORY_ID,
    }, [
      {
        id: 'variant_1',
        productId: 'product_1',
        labelEn: 'Large',
        price: 10,
      },
    ]);

    expect(payload.englishText).toContain('label:Large');
    expect(payload.arabicText).toContain('label:Large');
    expect(generateGeminiEmbeddings).toHaveBeenCalledOnce();
  });

  it('falls back between localized descriptions symmetrically', async () => {
    generateGeminiEmbeddings.mockResolvedValue([
      [1, 2, 3],
      [4, 5, 6],
    ]);

    const payload = await buildProductEmbeddingPayload({
      companyId: COMPANY_ID,
      categoryId: CATEGORY_ID,
      nameEn: 'Coffee cup',
      descriptionAr: 'كوب ورقي للقهوة',
    });

    expect(payload.englishText).toContain('description:كوب ورقي للقهوة');
    expect(payload.arabicText).toContain('description:كوب ورقي للقهوة');
    expect(generateGeminiEmbeddings).toHaveBeenCalledWith(
      [payload.englishText, payload.arabicText],
      expect.any(Object),
    );
  });
});
