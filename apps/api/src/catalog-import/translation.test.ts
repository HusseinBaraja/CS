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

const makeGroups = (count: number, rowsPerGroup = 1): ParsedCatalogImportGroup[] =>
  Array.from({ length: count }, (_, groupIndex) => ({
    productNo: `P-${groupIndex + 1}`,
    rows: Array.from({ length: rowsPerGroup }, (_, rowIndex) => ({
      row: groupIndex * rowsPerGroup + rowIndex + 2,
      productNo: `P-${groupIndex + 1}`,
      categoryName: `Category ${groupIndex + 1}`,
      productName: `Product ${groupIndex + 1}`,
      variantLabel: `Variant ${rowIndex + 1}`,
    })),
  }));

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

  test('limits concurrently translated groups', async () => {
    const activeGroups = new Set<string>();
    let maxActiveGroups = 0;
    const translateText: TranslateText = async (text, input) => {
      activeGroups.add(input.productNo);
      maxActiveGroups = Math.max(maxActiveGroups, activeGroups.size);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeGroups.delete(input.productNo);
      return `${text} ar`;
    };

    await createCatalogImportTranslator({ translateText }).translateGroups(makeGroups(6), 'en');

    expect(maxActiveGroups).toBeLessThanOrEqual(4);
  });

  test('limits concurrently translated variants per group', async () => {
    let activeVariants = 0;
    let maxActiveVariants = 0;
    const translateText: TranslateText = async (text, input) => {
      if (input.field !== 'variantLabel') {
        return `${text} ar`;
      }

      activeVariants += 1;
      maxActiveVariants = Math.max(maxActiveVariants, activeVariants);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeVariants -= 1;
      return `${text} ar`;
    };

    await createCatalogImportTranslator({ translateText }).translateGroups(makeGroups(1, 10), 'en');

    expect(maxActiveVariants).toBeLessThanOrEqual(8);
    expect(maxActiveVariants).toBeGreaterThan(1);
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
