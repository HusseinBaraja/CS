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
      unitLabel: 'Small',
      price: 9,
    }],
  },
  {
    productNo: 'P-2',
    rows: [{
      row: 3,
      productNo: 'P-2',
      categoryName: 'Plates',
      productName: 'Plate',
      unitLabel: 'White',
      price: 8,
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
      unitLabel: `Unit ${rowIndex + 1}`,
      price: rowIndex + 1,
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

  test('limits concurrently translated units per group', async () => {
    let activeUnits = 0;
    let maxActiveUnits = 0;
    const translateText: TranslateText = async (text, input) => {
      if (input.field !== 'unitLabel') {
        return `${text} ar`;
      }

      activeUnits += 1;
      maxActiveUnits = Math.max(maxActiveUnits, activeUnits);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeUnits -= 1;
      return `${text} ar`;
    };

    await createCatalogImportTranslator({ translateText }).translateGroups(makeGroups(1, 10), 'en');

    expect(maxActiveUnits).toBeLessThanOrEqual(8);
    expect(maxActiveUnits).toBeGreaterThan(1);
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

  test('skips generated descriptions when disabled', async () => {
    let generatedDescriptionCount = 0;
    const result = await createCatalogImportTranslator({
      translateText: async (text) => `${text} ar`,
      cleanProductName: async (sourceName) => sourceName,
      generateProductDescription: async () => {
        generatedDescriptionCount += 1;
        return 'Generated description';
      },
    }).translateGroups([groups[0]!], 'en', { generateDescriptions: false });

    expect(generatedDescriptionCount).toBe(0);
    expect(result.groups[0]?.description).toBeUndefined();
    expect(result.translatedFieldCount).toBe(3);
  });

  test('generates missing descriptions by default', async () => {
    const result = await createCatalogImportTranslator({
      translateText: async (text) => `${text} ar`,
      cleanProductName: async (sourceName) => sourceName,
      generateProductDescription: async () => 'Generated description',
    }).translateGroups([groups[0]!], 'en');

    expect(result.groups[0]?.description).toEqual({
      en: 'Generated description',
      ar: 'Generated description ar',
    });
  });
});
