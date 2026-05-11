import { describe, expect, test } from 'bun:test';
import {
  parseCreateProductBody,
  parseCreateVariantBody,
  parseUpdateProductBody,
  parseUpdateVariantBody,
} from './productSchemas';

describe('product schema parsers', () => {
  test('parseCreateProductBody accepts the fixed product contract', () => {
    expect(parseCreateProductBody({
      categoryId: 'category-1',
      productNo: ' P-1 ',
      nameAr: ' علبة ',
      descriptionEn: ' Box ',
      price: 12.5,
      currency: ' SAR ',
      primaryImage: ' products/image.jpg ',
    })).toEqual({
      ok: true,
      value: {
        categoryId: 'category-1',
        productNo: 'P-1',
        nameAr: 'علبة',
        descriptionEn: 'Box',
        price: 12.5,
        currency: 'SAR',
        primaryImage: 'products/image.jpg',
      },
    });
  });

  test('parseCreateProductBody accepts productNo-only creates', () => {
    expect(parseCreateProductBody({
      categoryId: 'category-1',
      productNo: ' SKU-1 ',
    })).toEqual({
      ok: true,
      value: {
        categoryId: 'category-1',
        productNo: 'SKU-1',
      },
    });
  });

  test('parseCreateProductBody requires one product identifier', () => {
    expect(parseCreateProductBody({
      categoryId: 'category-1',
      descriptionEn: 'Box',
    })).toEqual({
      ok: false,
      message: 'at least one of productNo, nameEn or nameAr is required',
    });
  });

  test('parseUpdateProductBody supports nullable clears', () => {
    expect(parseUpdateProductBody({
      productNo: null,
      nameEn: 'Burger Box',
      descriptionAr: null,
      price: null,
      currency: 'SAR',
      primaryImage: null,
    })).toEqual({
      ok: true,
      value: {
        productNo: null,
        nameEn: 'Burger Box',
        descriptionAr: null,
        price: null,
        currency: 'SAR',
      },
    });
  });

  test('parseUpdateProductBody rejects payloads with only removed or media fields', () => {
    expect(parseUpdateProductBody({
      specifications: { material: 'paper' },
      basePrice: 12,
      primaryImage: null,
    })).toEqual({
      ok: false,
      message: 'Request body must include at least one recognized updatable field',
    });
  });

  test('variant parsers use label and price only', () => {
    expect(parseCreateVariantBody({
      label: ' Large ',
      price: 1.5,
    })).toEqual({
      ok: true,
      value: {
        label: 'Large',
        price: 1.5,
      },
    });

    expect(parseUpdateVariantBody({
      label: ' Small ',
      price: null,
    })).toEqual({
      ok: true,
      value: {
        label: 'Small',
        price: null,
      },
    });
  });
});
