import ExcelJS from 'exceljs';
import type {
  CatalogImportFileMetadata,
  CatalogImportSourceLanguage,
  CatalogImportValidationError,
} from '../services/catalogImports';

export interface ParsedCatalogImportRow {
  row: number;
  productNo: string;
  categoryName: string;
  productName: string;
  description?: string;
  price?: number;
  currency?: string;
  variantLabel?: string;
  variantPrice?: number;
}

export interface ParsedCatalogImportGroup {
  productNo: string;
  rows: ParsedCatalogImportRow[];
}

export interface ParsedCatalogImportWorkbook {
  file: CatalogImportFileMetadata;
  groups: ParsedCatalogImportGroup[];
  blockingErrors: CatalogImportValidationError[];
}

const headerAliases = {
  categoryName: ['section name', 'اسم القسم'],
  productNo: ['product number', 'رقم المنتج'],
  productNameEn: ['english product name', 'اسم المنتج بالإنجليزية'],
  productNameAr: ['arabic product name', 'اسم المنتج بالعربية'],
  descriptionEn: ['english product description', 'وصف المنتج بالإنجليزية'],
  descriptionAr: ['arabic product description', 'وصف المنتج بالعربية'],
  price: ['product price', 'السعر'],
  currency: ['currency', 'العملة'],
  variantLabel: ['variant label', 'اسم المتغير'],
  variantPrice: ['variant price', 'سعر المتغير'],
} as const;

const normalizeHeader = (value: unknown): string =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

const normalizeCell = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const rawValue = typeof value === 'object' && 'text' in value
    ? (value as { text?: unknown }).text
    : value;
  const normalized = String(rawValue).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const parseNumberCell = (
  value: unknown,
  fieldName: string,
  row: number,
  errors: CatalogImportValidationError[],
): number | undefined => {
  const normalized = normalizeCell(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push({ row, message: `${fieldName} must be a non-negative number` });
    return undefined;
  }

  return parsed;
};

const resolveHeader = (
  headerMap: Map<string, number>,
  aliases: readonly string[],
): number | undefined => aliases
  .map((alias) => headerMap.get(normalizeHeader(alias)))
  .find((index): index is number => index !== undefined);

const readRequired = (
  rowValues: unknown[],
  columnIndex: number | undefined,
  fieldName: string,
  row: number,
  errors: CatalogImportValidationError[],
): string => {
  const value = columnIndex === undefined ? undefined : normalizeCell(rowValues[columnIndex]);
  if (!value) {
    errors.push({ row, message: `${fieldName} is required` });
    return '';
  }

  return value;
};

const fileMetadata = (file: File): CatalogImportFileMetadata => ({
  filename: file.name,
  ...(file.type ? { contentType: file.type } : {}),
  sizeBytes: file.size,
});

export const parseCatalogImportWorkbook = async (
  file: File,
  sourceLanguage: CatalogImportSourceLanguage,
): Promise<ParsedCatalogImportWorkbook> => {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  const blockingErrors: CatalogImportValidationError[] = [];
  if (!worksheet) {
    return { file: fileMetadata(file), groups: [], blockingErrors: [{ message: 'Workbook must include at least one sheet' }] };
  }

  const headerRow = worksheet.getRow(1);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, columnNumber) => {
    headerMap.set(normalizeHeader(cell.value), columnNumber);
  });

  const columns = {
    categoryName: resolveHeader(headerMap, headerAliases.categoryName),
    productNo: resolveHeader(headerMap, headerAliases.productNo),
    productName: resolveHeader(
      headerMap,
      sourceLanguage === 'en' ? headerAliases.productNameEn : headerAliases.productNameAr,
    ),
    description: resolveHeader(
      headerMap,
      sourceLanguage === 'en' ? headerAliases.descriptionEn : headerAliases.descriptionAr,
    ),
    price: resolveHeader(headerMap, headerAliases.price),
    currency: resolveHeader(headerMap, headerAliases.currency),
    variantLabel: resolveHeader(headerMap, headerAliases.variantLabel),
    variantPrice: resolveHeader(headerMap, headerAliases.variantPrice),
  };

  for (const [fieldName, columnIndex] of Object.entries({
    categoryName: columns.categoryName,
    productNo: columns.productNo,
    productName: columns.productName,
  })) {
    if (columnIndex === undefined) {
      blockingErrors.push({ message: `Missing required column: ${fieldName}` });
    }
  }

  if (blockingErrors.length > 0) {
    return { file: fileMetadata(file), groups: [], blockingErrors };
  }

  const groups = new Map<string, ParsedCatalogImportRow[]>();
  worksheet.eachRow((worksheetRow, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const rowValues = worksheetRow.values as unknown[];
    const productNo = readRequired(rowValues, columns.productNo, 'productNo', rowNumber, blockingErrors);
    const categoryName = readRequired(rowValues, columns.categoryName, 'categoryName', rowNumber, blockingErrors);
    const productName = readRequired(rowValues, columns.productName, 'productName', rowNumber, blockingErrors);
    if (!productNo || !categoryName || !productName) {
      return;
    }

    const price = parseNumberCell(rowValues[columns.price ?? -1], 'price', rowNumber, blockingErrors);
    const variantPrice = parseNumberCell(rowValues[columns.variantPrice ?? -1], 'variantPrice', rowNumber, blockingErrors);
    const currency = columns.currency === undefined ? undefined : normalizeCell(rowValues[columns.currency]);
    if (price !== undefined && !currency) {
      blockingErrors.push({ row: rowNumber, productNo, message: 'currency is required when price is set' });
    }

    const parsedRow: ParsedCatalogImportRow = {
      row: rowNumber,
      productNo,
      categoryName,
      productName,
      ...(columns.description !== undefined && normalizeCell(rowValues[columns.description])
        ? { description: normalizeCell(rowValues[columns.description]) }
        : {}),
      ...(price !== undefined ? { price } : {}),
      ...(currency ? { currency } : {}),
      ...(columns.variantLabel !== undefined && normalizeCell(rowValues[columns.variantLabel])
        ? { variantLabel: normalizeCell(rowValues[columns.variantLabel]) }
        : {}),
      ...(variantPrice !== undefined ? { variantPrice } : {}),
    };

    groups.set(productNo, [...(groups.get(productNo) ?? []), parsedRow]);
  });

  return {
    file: fileMetadata(file),
    groups: [...groups].map(([productNo, rows]) => ({ productNo, rows })),
    blockingErrors,
  };
};
