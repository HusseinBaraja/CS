import { ERROR_CODES, type ErrorCode } from '@cs/shared';

export type CatalogImportSourceLanguage = 'ar' | 'en';

export interface CatalogImportFileMetadata {
  filename: string;
  contentType?: string;
  sizeBytes: number;
}

export interface CatalogImportValidationError {
  message: string;
  row?: number;
  productNo?: string;
}

export interface CatalogImportTranslationWarning {
  productNo: string;
  field: string;
  message: string;
}

export interface CatalogImportGroupSummary {
  productNo: string;
  categoryName: string;
  productName: string;
  rowCount: number;
  variantCount: number;
  rows: number[];
}

export interface CatalogImportPreviewResult {
  file: CatalogImportFileMetadata;
  sourceLanguage: CatalogImportSourceLanguage;
  groups: CatalogImportGroupSummary[];
  categoryCount: number;
  productGroupCount: number;
  variantCount: number;
  blockingErrors: CatalogImportValidationError[];
  translationWarnings: CatalogImportTranslationWarning[];
}

export interface CatalogImportApplyResult {
  company: {
    id: string;
    name: string;
  };
  createdOrUpdatedCategoryCount: number;
  replacedProductGroupCount: number;
  replacedVariantCount: number;
  translatedFieldCount: number;
  notTranslatedFallbackCount: number;
}

export interface CatalogImportUploadInput {
  file?: File;
  sourceLanguage: CatalogImportSourceLanguage;
}

export interface CatalogImportsService {
  preview(companyId: string, input: CatalogImportUploadInput): Promise<CatalogImportPreviewResult>;
  apply(companyId: string, input: CatalogImportUploadInput): Promise<CatalogImportApplyResult>;
}

export class CatalogImportsServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 404 | 503;

  constructor(code: ErrorCode, message: string, status: 400 | 404 | 503) {
    super(message);
    this.name = 'CatalogImportsServiceError';
    this.code = code;
    this.status = status;
  }
}

export const createCatalogImportValidationError = (message: string): CatalogImportsServiceError =>
  new CatalogImportsServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createCatalogImportNotFoundError = (message: string): CatalogImportsServiceError =>
  new CatalogImportsServiceError(ERROR_CODES.NOT_FOUND, message, 404);

export const createCatalogImportDatabaseError = (message: string): CatalogImportsServiceError =>
  new CatalogImportsServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
