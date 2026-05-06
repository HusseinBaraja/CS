/// <reference types='vite/client' />
import { describe, expect, it } from 'vitest';
import type { Id } from '../_generated/dataModel';
import { getEmbeddingReplacementArgs } from './embedding';
import {
  createProductPatch,
  mergeVariantUpdateState,
  normalizeCreateState,
  normalizeVariantAttributes,
} from './normalization';

const COMPANY_ID = 'company_1' as Id<'companies'>;
const CATEGORY_ID = 'category_1' as Id<'categories'>;
const PRODUCT_ID = 'product_1' as Id<'products'>;

describe('products normalization helpers', () => {
  it('normalizes create state by trimming strings and omitting empty optionals', () => {
    const state = normalizeCreateState({
      companyId: COMPANY_ID,
      categoryId: CATEGORY_ID,
      nameEn: '  Burger Box  ',
      nameAr: '   ',
      descriptionEn: '  Disposable  ',
      currency: '  USD  ',
    });

    expect(state).toEqual({
      companyId: 'company_1',
      categoryId: 'category_1',
      nameEn: 'Burger Box',
      descriptionEn: 'Disposable',
      currency: 'USD',
    });
  });

  it('rejects duplicate variant attribute keys after trimming', () => {
    expect(() =>
      normalizeVariantAttributes({
        color: 'red',
        ' color ': 'blue',
      }),
    ).toThrowError('VALIDATION_FAILED: attributes keys must be unique after trimming: color');
  });

  it('builds product patch and supports explicit null clearing for optional fields', () => {
    const patch = createProductPatch({
      companyId: COMPANY_ID,
      productId: PRODUCT_ID,
      nameAr: null,
      price: null,
    });

    expect(patch).toEqual({
      nameAr: undefined,
      price: undefined,
    });
  });

  it('merges variant updates and drops price override when null is provided', () => {
    const next = mergeVariantUpdateState(
      {
        id: 'variant_1',
        productId: 'product_1',
        label: 'Large',
        price: 12,
      },
      {
        price: null,
      },
    );

    expect(next).toEqual({
      id: 'variant_1',
      productId: 'product_1',
      label: 'Large',
      });
  });
});

describe('products embedding payload helper', () => {
  it('requires all embedding replacement fields when any is provided', () => {
    expect(() =>
      getEmbeddingReplacementArgs({
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        englishText: 'partial',
      }),
    ).toThrowError('All embedding fields must be provided together');
  });

  it('returns null for no replacement and structured args for complete replacement', () => {
    expect(
      getEmbeddingReplacementArgs({
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
      }),
    ).toBeUndefined();

    expect(
      getEmbeddingReplacementArgs({
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        englishEmbedding: [1, 2],
        arabicEmbedding: [3, 4],
        englishText: 'en',
        arabicText: 'ar',
      }),
    ).toEqual({
      companyId: 'company_1',
      productId: 'product_1',
      englishEmbedding: [1, 2],
      arabicEmbedding: [3, 4],
      englishText: 'en',
      arabicText: 'ar',
    });
  });
});

