import { describe, expect, it } from 'vitest';

import { buildCatalogTemplateHeaders, type CatalogTemplateOptions } from './catalogTemplate';

const baseOptions: CatalogTemplateOptions = {
  currency: 'SAR',
  includePrice: true,
  language: 'ar',
  includeSpecifications: true,
  includeDescription: true,
};

describe('buildCatalogTemplateHeaders', () => {
  it('maps Arabic headers with all options enabled', () => {
    expect(buildCatalogTemplateHeaders(baseOptions)).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'وصف المنتج بالعربية',
      'السعر (ريال سعودي)',
      'المواصفات',
    ]);
  });

  it('maps English headers with description off', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, currency: 'YER', language: 'en', includeDescription: false })).toEqual([
      'Section Name',
      'Product Number',
      'English Product Name',
      'Base Price (Yemeni Rial)',
      'Additional Information',
    ]);
  });

  it('removes price and currency headers when price is off', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, includePrice: false })).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'وصف المنتج بالعربية',
      'المواصفات',
    ]);
  });

  it('removes the specifications header when additional info is off', () => {
    expect(buildCatalogTemplateHeaders({ ...baseOptions, includeSpecifications: false })).toEqual([
      'اسم القسم',
      'رقم المنتج',
      'اسم المنتج بالعربية',
      'وصف المنتج بالعربية',
      'السعر (ريال سعودي)',
    ]);
  });
});
