/// <reference types='vite/client' />
import { describe, expect, it } from 'vitest';
import type { Id } from '../_generated/dataModel';
import { getEmbeddingReplacementArgs } from './embedding';
import {
  createProductPatch,
  mergeUpdateState,
  mergeVariantUpdateState,
  normalizeCreateState,
  normalizeVariantCreateState,
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
      primaryImage: '  raw-object-key.jpg  ',
    });

    expect(state).toEqual({
      companyId: 'company_1',
      categoryId: 'category_1',
      nameEn: 'Burger Box',
      descriptionEn: 'Disposable',
      currency: 'USD',
    });
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

  it('keeps product update normalization focused on generic product fields', () => {
    const next = mergeUpdateState(
      {
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        categoryId: CATEGORY_ID,
        revision: 1,
        nameEn: 'Burger Box',
        primaryImage: 'companies/company_1/products/product_1/current.jpg',
      },
      {
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        descriptionEn: '  Fresh box  ',
      },
    );

    expect(next).toEqual({
      companyId: COMPANY_ID,
      categoryId: CATEGORY_ID,
      nameEn: 'Burger Box',
      descriptionEn: 'Fresh box',
    });
  });

  it('rejects product updates that clear both names', () => {
    expect(() =>
      mergeUpdateState(
        {
          companyId: COMPANY_ID,
          productId: PRODUCT_ID,
          categoryId: CATEGORY_ID,
          revision: 1,
          nameEn: 'Burger Box',
          nameAr: 'علبة برجر',
        },
        {
          companyId: COMPANY_ID,
          productId: PRODUCT_ID,
          nameEn: null,
          nameAr: '   ',
        },
      ),
    ).toThrowError('VALIDATION_FAILED: at least one of nameEn or nameAr is required');
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
      undefined,
    );

    expect(next).toEqual({
      id: 'variant_1',
      productId: 'product_1',
      label: 'Large',
    });
  });

  it('rejects priced variants when the parent product has no currency', () => {
    expect(() =>
      normalizeVariantCreateState(
        {
          productId: PRODUCT_ID,
          label: 'Large',
          price: 12,
        },
        undefined,
      ),
    ).toThrowError('VALIDATION_FAILED: currency is required when a price is set');

    expect(() =>
      mergeVariantUpdateState(
        {
          id: 'variant_1',
          productId: PRODUCT_ID,
          label: 'Large',
        },
        {
          price: 12,
        },
        undefined,
      ),
    ).toThrowError('VALIDATION_FAILED: currency is required when a price is set');
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
    ).toThrowError('VALIDATION_FAILED: Embedding replacement payload must be all-or-none');
  });

  it('returns null for no replacement and structured args for complete replacement', () => {
    expect(
      getEmbeddingReplacementArgs({
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
      }),
    ).toBeNull();

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

