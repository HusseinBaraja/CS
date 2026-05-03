import { beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogTemplateFilename, downloadCatalogTemplate } from './downloadCatalogTemplate';

const worksheet = { worksheet: true };
const workbook = { SheetNames: [], Sheets: {} };

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn(() => worksheet),
    book_new: vi.fn(() => workbook),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

describe('downloadCatalogTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the selected headers to the expected workbook filename', async () => {
    const XLSX = await import('xlsx');

    downloadCatalogTemplate({
      currency: 'YER',
      includePrice: true,
      language: 'en',
      includeSpecifications: false,
      includeDescription: false,
    });

    expect(XLSX.utils.aoa_to_sheet).toHaveBeenCalledWith([
      ['Category Name', 'English Product Name', 'Base Price', 'Base Currency (YER)'],
    ]);
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(workbook, worksheet, 'Catalog Template');
    expect(XLSX.writeFile).toHaveBeenCalledWith(workbook, catalogTemplateFilename);
    expect(catalogTemplateFilename).toBe('reda-catalog-template.xlsx');
  });
});
