import { describe, expect, it } from 'vitest';

import { buildCatalogTemplateHeaders, type CatalogTemplateOptions } from './catalogTemplate';

const baseOptions: CatalogTemplateOptions = {
  language: 'ar',
  includeDescription: true,
};

describe('buildCatalogTemplateHeaders', () => {
  it('maps Arabic headers for the real unit import contract', () => {
    expect(buildCatalogTemplateHeaders(baseOptions)).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'اسم المنتج بالإنجليزية',
      'وصف المنتج بالعربية',
      'وصف المنتج بالإنجليزية',
      'الوحدة',
      'السعر',
    ]);
  });

  it('maps English headers with description off', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, language: 'en', includeDescription: false })).toEqual([
      'Section Name',
      'Product Number',
      'Arabic Product Name',
      'English Product Name',
      'Unit',
      'Price',
    ]);
  });
});
