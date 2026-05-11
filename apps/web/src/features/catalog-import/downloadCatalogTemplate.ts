import { buildCatalogTemplateHeaders, type CatalogTemplateOptions } from './catalogTemplate';

export const catalogTemplateFilename = 'reda-catalog-template.xlsx';

export async function downloadCatalogTemplate(options: CatalogTemplateOptions): Promise<void> {
  let ExcelJS: typeof import('exceljs');

  try {
    const excelModule = await import('exceljs') as typeof import('exceljs') & {
      default?: typeof import('exceljs');
    };
    ExcelJS = excelModule.default ?? excelModule;
  } catch (error) {
    console.error('[downloadCatalogTemplate] Failed to load ExcelJS for catalog template', error);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Catalog Template');

  worksheet.addRow(buildCatalogTemplateHeaders(options));

  const workbookBuffer = await workbook.xlsx.writeBuffer();
  const workbookBlob = new Blob([workbookBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = URL.createObjectURL(workbookBlob);
  const downloadLink = document.createElement('a');

  downloadLink.href = downloadUrl;
  downloadLink.download = catalogTemplateFilename;
  downloadLink.click();
  URL.revokeObjectURL(downloadUrl);
}
