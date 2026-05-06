import { beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogTemplateFilename, downloadCatalogTemplate } from './downloadCatalogTemplate';

const mocks = vi.hoisted(() => {
  const addRow = vi.fn();
  const writeBuffer = vi.fn(async () => new Uint8Array([1, 2, 3]));
  const addWorksheet = vi.fn(() => ({ addRow }));
  const workbook = { addWorksheet, xlsx: { writeBuffer } };
  const createObjectURL = vi.fn(() => 'blob:catalog-template');
  const revokeObjectURL = vi.fn();
  const click = vi.fn();
  const downloadLink = { click } as unknown as HTMLAnchorElement;
  const createElement = vi.fn(() => downloadLink);
  const Workbook = vi.fn(function WorkbookMock() {
    return workbook;
  });

  return {
    Workbook,
    addRow,
    addWorksheet,
    click,
    createElement,
    createObjectURL,
    downloadLink,
    revokeObjectURL,
    writeBuffer,
  };
});

vi.mock('exceljs', () => ({
  default: {
    Workbook: mocks.Workbook,
  },
}));

describe('downloadCatalogTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createElement.mockReturnValue(mocks.downloadLink);
    vi.stubGlobal('URL', {
      createObjectURL: mocks.createObjectURL,
      revokeObjectURL: mocks.revokeObjectURL,
    });
    vi.spyOn(document, 'createElement').mockImplementation(mocks.createElement as unknown as typeof document.createElement);
  });

  it('writes the selected headers to the expected workbook filename', async () => {
    const ExcelJS = await import('exceljs');

    await downloadCatalogTemplate({
      currency: 'YER',
      includePrice: true,
      language: 'en',
      includeSpecifications: false,
      includeDescription: false,
    });

    expect(ExcelJS.default.Workbook).toHaveBeenCalled();
    expect(mocks.addWorksheet).toHaveBeenCalledWith('Catalog Template');
    expect(mocks.addRow).toHaveBeenCalledWith(
      ['Section Name', 'Product Number', 'English Product Name', 'Base Price (Yemeni Rial)'],
    );
    expect(mocks.writeBuffer).toHaveBeenCalled();
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.click).toHaveBeenCalled();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:catalog-template');
    expect(catalogTemplateFilename).toBe('reda-catalog-template.xlsx');
  });
});
