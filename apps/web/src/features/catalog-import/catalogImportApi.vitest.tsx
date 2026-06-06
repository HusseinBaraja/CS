import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyCatalogImport, previewCatalogImport } from './catalogImportApi';

const okJsonResponse = (payload: unknown): Response => new Response(JSON.stringify(payload), {
  headers: { 'Content-Type': 'application/json' },
  status: 200,
});

const file = new File(['product_no,name\n1,Phone'], 'catalog.csv', { type: 'text/csv' });

describe('catalogImportApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('URL-encodes company id for preview requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJsonResponse({
      ok: true,
      preview: {
        file: { filename: 'catalog.csv', sizeBytes: 23, contentType: 'text/csv' },
        sourceLanguage: 'en',
        groups: [],
        categoryCount: 0,
        productGroupCount: 0,
        variantCount: 0,
        blockingErrors: [],
        translationWarnings: [],
      },
    }));

    await previewCatalogImport('company/id with spaces', file, 'en');

    expect(fetchMock).toHaveBeenCalledWith('/api/companies/company%2Fid%20with%20spaces/catalog-imports/preview', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });

  it('URL-encodes company id for apply requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJsonResponse({
      ok: true,
      result: {
        company: { id: 'company/id with spaces', name: 'YAS_Trading' },
        createdOrUpdatedCategoryCount: 0,
        replacedProductGroupCount: 0,
        replacedVariantCount: 0,
        translatedFieldCount: 0,
        notTranslatedFallbackCount: 0,
      },
    }));

    await applyCatalogImport('company/id with spaces', file, 'en');

    expect(fetchMock).toHaveBeenCalledWith('/api/companies/company%2Fid%20with%20spaces/catalog-imports/apply', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });
});
