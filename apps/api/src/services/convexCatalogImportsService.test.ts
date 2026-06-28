import { describe, expect, test } from 'vitest';
import { ConvexIdValidationError } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import ExcelJS from 'exceljs';
import { createConvexCatalogImportsService } from './convexCatalogImportsService';
import {
  createCatalogImportDatabaseError,
  createCatalogImportValidationError,
} from './catalogImports';

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient) =>
  createConvexCatalogImportsService({
    createClient: () => client as never,
  });

const createWorkbookFile = () =>
  new File(['productNo,categoryName,productName\nP-1,Food,Burger\n'], 'catalog.csv', {
    type: 'text/csv',
  });

const createValidWorkbookFile = async (includeCurrency = false) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catalog');
  sheet.addRow(includeCurrency
    ? ['Section Name', 'Product Number', 'English Product Name', 'Currency', 'Unit', 'Price']
    : ['Section Name', 'Product Number', 'English Product Name', 'Unit', 'Price']);
  sheet.addRow(includeCurrency
    ? ['Cups', 'P-1', 'Paper Cup', 'USD', 'Small', 9]
    : ['Cups', 'P-1', 'Paper Cup', 'Small', 9]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], 'catalog.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

describe('createConvexCatalogImportsService', () => {
  test('normalizes precise Convex validation errors', async () => {
    const namedValidationError = new Error('Customer-provided content');
    namedValidationError.name = 'ArgumentValidationError';
    const namedService = createService({
      query: async () => {
        throw namedValidationError;
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });
    await expect(namedService.preview('company-1', {
      file: createWorkbookFile(),
      sourceLanguage: 'en',
    })).rejects.toEqual(createCatalogImportValidationError('Invalid catalog import payload'));

    const taggedService = createService({
      query: async () => {
        throw new Error('ArgumentValidationError: Unable to decode value');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });
    await expect(taggedService.preview('company-1', {
      file: createWorkbookFile(),
      sourceLanguage: 'en',
    })).rejects.toEqual(createCatalogImportValidationError('Invalid catalog import payload'));

    const exactMessageService = createService({
      query: async () => {
        throw new Error('Value does not match validator');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });
    await expect(exactMessageService.preview('company-1', {
      file: createWorkbookFile(),
      sourceLanguage: 'en',
    })).rejects.toEqual(createCatalogImportValidationError('Invalid catalog import payload'));
  });

  test('does not map user-content substring matches to validation errors', async () => {
    const service = createService({
      query: async () => {
        throw new Error('Product note says Unable to decode but transport failed');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });

    await expect(service.preview('company-1', {
      file: createWorkbookFile(),
      sourceLanguage: 'en',
    })).rejects.toEqual(createCatalogImportDatabaseError('Catalog import is temporarily unavailable'));
  });

  test('prefers known id validation before tagged error parsing', async () => {
    const service = createService({
      query: async () => {
        throw new ConvexIdValidationError('companies', 'VALIDATION_FAILED: Company not found');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });

    await expect(service.preview('company-1', {
      file: createWorkbookFile(),
      sourceLanguage: 'en',
    })).rejects.toEqual(createCatalogImportValidationError('Invalid company identifier'));
  });

  test('keeps tagged error parsing', async () => {
    const service = createService({
      query: async () => {
        throw new Error('VALIDATION_FAILED: Spreadsheet row is invalid');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });

    await expect(service.preview('company-1', {
      file: createWorkbookFile(),
      sourceLanguage: 'en',
    })).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Spreadsheet row is invalid',
      status: 400,
    });
  });

  test('blocks preview when company operating currency is missing', async () => {
    let queryCount = 0;
    const service = createService({
      query: async () => {
        queryCount += 1;
        return queryCount === 1 ? { id: 'company-1', name: 'YAS_Trading' } : {};
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });

    const preview = await service.preview('company-1', {
      file: await createValidWorkbookFile(),
      sourceLanguage: 'en',
    });

    expect(preview.blockingErrors).toContainEqual({
      message: 'Company operating currency must be configured before catalog import',
    });
  });

  test('applies import with company operating currency and ignores spreadsheet currency', async () => {
    let queryCount = 0;
    let actionArgs: unknown;
    const service = createConvexCatalogImportsService({
      createClient: () => ({
        query: async () => {
          queryCount += 1;
          return queryCount === 1
            ? { id: 'company-1', name: 'YAS_Trading' }
            : { operatingCurrency: 'YER' };
        },
        action: async (_reference: unknown, args: unknown) => {
          actionArgs = args;
          return {
            createdOrUpdatedCategoryCount: 1,
            replacedProductGroupCount: 1,
            replacedUnitCount: 1,
          };
        },
      }) as never,
      translator: {
        translateGroups: async () => ({
          groups: [{
            productNo: 'P-1',
            category: { en: 'Cups', ar: 'أكواب' },
            productName: { en: 'Paper Cup', ar: 'كوب ورقي' },
            units: [{ labelEn: 'Small', labelAr: 'صغير', price: 9 }],
          }],
          translatedFieldCount: 0,
          notTranslatedFallbackCount: 0,
          warnings: [],
        }),
      },
    });

    await service.apply('company-1', {
      file: await createValidWorkbookFile(true),
      sourceLanguage: 'en',
    });

    expect(actionArgs).toMatchObject({
      groups: [{
        currency: 'YER',
      }],
    });
  });

  test('keeps description translation enabled when applying imports', async () => {
    let translatorOptions: unknown;
    const service = createConvexCatalogImportsService({
      createClient: () => ({
        query: async () => ({ id: 'company-1', name: 'YAS_Trading', operatingCurrency: 'YER' }),
        action: async () => ({
          createdOrUpdatedCategoryCount: 1,
          replacedProductGroupCount: 1,
          replacedUnitCount: 1,
        }),
      }) as never,
      translator: {
        translateGroups: async (_groups, _sourceLanguage, options) => {
          translatorOptions = options;
          return {
            groups: [{
              productNo: 'P-1',
              category: { en: 'Cups', ar: 'أكواب' },
              productName: { en: 'Paper Cup', ar: 'كوب ورقي' },
              description: { en: 'Paper cup description', ar: 'not_translated' },
              units: [{ labelEn: 'Small', labelAr: 'صغير', price: 9 }],
            }],
            translatedFieldCount: 0,
            notTranslatedFallbackCount: 0,
            warnings: [],
          };
        },
      },
    });

    await service.apply('company-1', {
      file: await createValidWorkbookFile(),
      sourceLanguage: 'en',
    });

    expect(translatorOptions).toEqual({ generateDescriptions: undefined });
    expect(translatorOptions).not.toHaveProperty('translateDescriptions');
  });
});
