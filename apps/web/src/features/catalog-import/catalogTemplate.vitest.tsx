import { describe, expect, it } from 'vitest';

import { buildCatalogTemplateHeaders, type CatalogTemplateOptions } from './catalogTemplate';

const baseOptions: CatalogTemplateOptions = {
  currency: 'SAR',
  includePrice: true,
  language: 'ar',
  includeDescription: true,
  includePrimaryImage: true,
  includeVariants: true,
};

describe('buildCatalogTemplateHeaders', () => {
  it('maps Arabic headers with all options enabled', () => {
    expect(buildCatalogTemplateHeaders(baseOptions)).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'اسم المنتج بالإنجليزية',
      'وصف المنتج بالعربية',
      'وصف المنتج بالإنجليزية',
      'السعر',
      'العملة',
      'الصورة الرئيسية',
      'اسم المتغير',
      'سعر المتغير',
    ]);
  });

  it('maps English headers with description off', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, currency: 'YER', language: 'en', includeDescription: false })).toEqual([
      'Section Name',
      'Product Number',
      'Arabic Product Name',
      'English Product Name',
      'Product Price',
      'Currency',
      'Primary Image',
      'Variant Label',
      'Variant Price',
    ]);
  });

  it('removes price and currency headers when price is off', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, currency: undefined, includePrice: false })).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'اسم المنتج بالإنجليزية',
      'وصف المنتج بالعربية',
      'وصف المنتج بالإنجليزية',
      'الصورة الرئيسية',
      'اسم المتغير',
      'سعر المتغير',
    ]);
  });

  it('keeps the currency header when price is on and currency is absent', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, currency: undefined })).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'اسم المنتج بالإنجليزية',
      'وصف المنتج بالعربية',
      'وصف المنتج بالإنجليزية',
      'السعر',
      'العملة',
      'الصورة الرئيسية',
      'اسم المتغير',
      'سعر المتغير',
    ]);
  });

  it('removes optional image and variant headers when disabled', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, includePrimaryImage: false, includeVariants: false })).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'اسم المنتج بالإنجليزية',
      'وصف المنتج بالعربية',
      'وصف المنتج بالإنجليزية',
      'السعر',
      'العملة',
    ]);
  });
});
