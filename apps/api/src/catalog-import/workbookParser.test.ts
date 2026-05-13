import { describe, expect, test } from 'bun:test';
import ExcelJS from 'exceljs';
import { parseCatalogImportWorkbook } from './workbookParser';

const createWorkbookFile = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catalog');
  sheet.addRow(['Section Name', 'Product Number', 'English Product Name', 'Product Price', 'Currency', 'Variant Label', 'Variant Price']);
  sheet.addRow(['Cups', 'P-1', 'Paper Cup', 10, 'SAR', 'Small', 9]);
  sheet.addRow(['Cups', 'P-1', 'Paper Cup', 10, 'SAR', 'Large', 12]);
  sheet.addRow(['Plates', 'P-2', 'Plate', undefined, undefined, 'White', undefined]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], 'catalog.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

describe('catalog import workbook parser', () => {
  test('groups repeated product numbers into one product group with variants', async () => {
    const parsed = await parseCatalogImportWorkbook(await createWorkbookFile(), 'en');

    expect(parsed.blockingErrors).toEqual([]);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]?.productNo).toBe('P-1');
    expect(parsed.groups[0]?.rows.map((row) => row.variantLabel)).toEqual(['Small', 'Large']);
    expect(parsed.groups[1]?.productNo).toBe('P-2');
  });

  test('rejects invalid spreadsheet shape', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Catalog').addRow(['Product Number']);
    const buffer = await workbook.xlsx.writeBuffer();

    const parsed = await parseCatalogImportWorkbook(new File([buffer], 'bad.xlsx'), 'en');

    expect(parsed.groups).toEqual([]);
    expect(parsed.blockingErrors.map((error) => error.message)).toContain('Missing required column: categoryName');
    expect(parsed.blockingErrors.map((error) => error.message)).toContain('Missing required column: productName');
  });
});
