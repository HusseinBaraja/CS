import * as XLSX from 'xlsx';

import { buildCatalogTemplateHeaders, type CatalogTemplateOptions } from './catalogTemplate';

export const catalogTemplateFilename = 'reda-catalog-template.xlsx';

export function downloadCatalogTemplate(options: CatalogTemplateOptions): void {
  const worksheet = XLSX.utils.aoa_to_sheet([buildCatalogTemplateHeaders(options)]);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Catalog Template');
  XLSX.writeFile(workbook, catalogTemplateFilename);
}
