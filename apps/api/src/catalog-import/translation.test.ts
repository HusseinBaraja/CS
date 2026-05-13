import { describe, expect, test } from 'bun:test';
import { createCatalogImportTranslator, type TranslateText } from './translation';
import type { ParsedCatalogImportGroup } from './workbookParser';

const groups: ParsedCatalogImportGroup[] = [
  {
    productNo: 'P-1',
    rows: [{
      row: 2,
      productNo: 'P-1',
      categoryName: 'Cups',
      productName: 'Paper Cup',
      variantLabel: 'Small',
    }],
  },
  {
    productNo: 'P-2',
    rows: [{
      row: 3,
      productNo: 'P-2',
      categoryName: 'Plates',
      productName: 'Plate',
      variantLabel: 'White',
    }],
  },
];

describe('catalog import translation', () => {
  test('translates product groups concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const translateText: TranslateText = async (text) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return `${text} ar`;
    };

    const result = await createCatalogImportTranslator({ translateText }).translateGroups(groups, 'en');

    expect(maxActive).toBeGreaterThan(1);
    expect(result.groups[0]?.category).toEqual({ en: 'Cups', ar: 'Cups ar' });
    expect(result.translatedFieldCount).toBe(6);
  });

  test('stores not_translated when translation fails', async () => {
    const result = await createCatalogImportTranslator({
      translateText: async () => {
        throw new Error('provider chain failed');
      },
    }).translateGroups([groups[0]!], 'en');

    expect(result.notTranslatedFallbackCount).toBe(3);
    expect(result.warnings).toHaveLength(3);
    expect(result.groups[0]?.productName).toEqual({ en: 'Paper Cup', ar: 'not_translated' });
  });
});
