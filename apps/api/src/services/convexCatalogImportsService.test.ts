import { describe, expect, test } from 'bun:test';
import { ConvexIdValidationError } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
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
});
