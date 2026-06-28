import { describe, expect, test } from 'vitest';
import ExcelJS from 'exceljs';
import { parseCatalogImportWorkbook } from './workbookParser';

const createWorkbookFile = async (includeCurrency = false) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catalog');
  sheet.addRow(includeCurrency
    ? ['Section Name', 'Product Number', 'English Product Name', 'Currency', 'Unit', 'Price']
    : ['Section Name', 'Product Number', 'English Product Name', 'Unit', 'Price']);
  sheet.addRow(includeCurrency ? ['Cups', 'P-1', 'Paper Cup', 'USD', 'Small', 9] : ['Cups', 'P-1', 'Paper Cup', 'Small', 9]);
  sheet.addRow(includeCurrency ? ['Cups', 'P-1', 'Paper Cup', 'YER', 'Large', 12] : ['Cups', 'P-1', 'Paper Cup', 'Large', 12]);
  sheet.addRow(includeCurrency ? ['Plates', 'P-2', 'Plate', 'SAR', 'White', 8] : ['Plates', 'P-2', 'Plate', 'White', 8]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], 'catalog.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

describe('catalog import workbook parser', () => {
  test('groups repeated product numbers into one product group with units', async () => {
    const parsed = await parseCatalogImportWorkbook(await createWorkbookFile(), 'en');

    expect(parsed.blockingErrors).toEqual([]);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]?.productNo).toBe('P-1');
    expect(parsed.groups[0]?.rows.map((row) => row.unitLabel)).toEqual(['Small', 'Large']);
    expect(parsed.groups[1]?.productNo).toBe('P-2');
  });

  test('ignores legacy currency columns when present', async () => {
    const parsed = await parseCatalogImportWorkbook(await createWorkbookFile(true), 'en');

    expect(parsed.blockingErrors).toEqual([]);
    expect(parsed.groups[0]?.rows[0]).not.toHaveProperty('currency');
  });

  test('rejects invalid spreadsheet shape', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Catalog').addRow(['Product Number']);
    const buffer = await workbook.xlsx.writeBuffer();

    const parsed = await parseCatalogImportWorkbook(new File([buffer], 'bad.xlsx'), 'en');

    expect(parsed.groups).toEqual([]);
    expect(parsed.blockingErrors.map((error) => error.message)).toContain('Missing required column: categoryName');
    expect(parsed.blockingErrors.map((error) => error.message)).toContain('Missing required column: productName');
    expect(parsed.blockingErrors.map((error) => error.message)).toContain('Missing required column: unitLabel');
    expect(parsed.blockingErrors.map((error) => error.message)).not.toContain('Missing required column: currency');
  });
});
