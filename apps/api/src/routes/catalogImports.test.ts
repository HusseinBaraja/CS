import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import type {
  CatalogImportUploadInput,
  CatalogImportsService,
} from '../services/catalogImports';
import { CatalogImportsServiceError } from '../services/catalogImports';

const API_KEY = 'test-api-key';
const authHeaders = { 'x-api-key': API_KEY };

const createFormData = (file = new File(['fake'], 'catalog.xlsx')) => {
  const body = new FormData();
  body.set('sourceLanguage', 'ar');
  body.set('file', file);
  return body;
};

const createStubCatalogImportsService = (
  overrides: Partial<CatalogImportsService> = {},
): CatalogImportsService => ({
  preview: async (_companyId: string, input: CatalogImportUploadInput) => ({
    file: {
      filename: input.file?.name ?? 'catalog.xlsx',
      sizeBytes: input.file?.size ?? 0,
    },
    sourceLanguage: input.sourceLanguage,
    groups: [{
      productNo: 'P-1',
      categoryName: 'أكواب',
      productName: 'كوب ورقي',
      rowCount: 2,
      variantCount: 2,
      rows: [2, 3],
    }],
    categoryCount: 1,
    productGroupCount: 1,
    variantCount: 2,
    blockingErrors: [],
    translationWarnings: [],
  }),
  apply: async (_companyId: string) => ({
    company: { id: 'company-1', name: 'YAS_Trading' },
    createdOrUpdatedCategoryCount: 1,
    replacedProductGroupCount: 1,
    replacedVariantCount: 2,
    translatedFieldCount: 4,
    notTranslatedFallbackCount: 0,
  }),
  ...overrides,
});

const createTestApp = (catalogImportsService: CatalogImportsService) =>
  createApp({
    catalogImportsService,
    runtimeConfig: { apiKey: API_KEY },
  });

describe('catalog import routes', () => {
  test('preview rejects missing file', async () => {
    const app = createTestApp(createStubCatalogImportsService());
    const body = new FormData();
    body.set('sourceLanguage', 'ar');

    const response = await app.request('/api/companies/company-1/catalog-imports/preview', {
      method: 'POST',
      headers: authHeaders,
      body,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Spreadsheet file is required',
      },
    });
  });

  test('preview forwards file and source language to the service', async () => {
    let receivedCompanyId: string | undefined;
    let receivedInput: CatalogImportUploadInput | undefined;
    const app = createTestApp(createStubCatalogImportsService({
      preview: async (companyId, input) => {
        receivedCompanyId = companyId;
        receivedInput = input;
        return createStubCatalogImportsService().preview(companyId, input);
      },
    }));

    const response = await app.request('/api/companies/company-1/catalog-imports/preview', {
      method: 'POST',
      headers: authHeaders,
      body: createFormData(),
    });

    expect(response.status).toBe(200);
    expect(receivedCompanyId).toBe('company-1');
    expect(receivedInput?.sourceLanguage).toBe('ar');
    expect(receivedInput?.file?.name).toBe('catalog.xlsx');
    expect(await response.json()).toEqual({
      ok: true,
      preview: {
        file: { filename: 'catalog.xlsx', sizeBytes: 4 },
        sourceLanguage: 'ar',
        groups: [{
          productNo: 'P-1',
          categoryName: 'أكواب',
          productName: 'كوب ورقي',
          rowCount: 2,
          variantCount: 2,
          rows: [2, 3],
        }],
        categoryCount: 1,
        productGroupCount: 1,
        variantCount: 2,
        blockingErrors: [],
        translationWarnings: [],
      },
    });
  });

  test('apply maps missing company service errors to 404', async () => {
    const app = createTestApp(createStubCatalogImportsService({
      apply: async () => {
        throw new CatalogImportsServiceError(ERROR_CODES.NOT_FOUND, 'Company not found', 404);
      },
    }));

    const response = await app.request('/api/companies/missing/catalog-imports/apply', {
      method: 'POST',
      headers: authHeaders,
      body: createFormData(),
    });

    expect(response.status).toBe(404);
  });
});
