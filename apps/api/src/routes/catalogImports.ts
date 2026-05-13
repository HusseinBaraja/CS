import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { CatalogImportsService, CatalogImportSourceLanguage } from '../services/catalogImports';
import { CatalogImportsServiceError } from '../services/catalogImports';
import { requireRouteParam } from './routeParams';

interface CatalogImportsRoutesOptions {
  catalogImportsService: CatalogImportsService;
}

const isServiceError = (error: unknown): error is CatalogImportsServiceError =>
  error instanceof CatalogImportsServiceError;

const parseSourceLanguage = (value: FormDataEntryValue | null): CatalogImportSourceLanguage | null => {
  if (value === 'ar' || value === 'en') {
    return value;
  }

  return null;
};

const parseMultipartInput = async (request: Request) => {
  const formData = await request.formData();
  const sourceLanguage = parseSourceLanguage(formData.get('sourceLanguage'));
  if (!sourceLanguage) {
    return {
      ok: false as const,
      message: 'sourceLanguage must be ar or en',
    };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return {
      ok: false as const,
      message: 'Spreadsheet file is required',
    };
  }

  return {
    ok: true as const,
    value: { file, sourceLanguage },
  };
};

export const createCatalogImportsRoutes = (
  options: CatalogImportsRoutesOptions,
) => {
  const app = new Hono();

  app.post('/preview', async (c) => {
    const companyId = requireRouteParam(c.req.param('companyId'), 'companyId');
    const parsedInput = await parseMultipartInput(c.req.raw);
    if (!parsedInput.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedInput.message), 400);
    }

    try {
      const preview = await options.catalogImportsService.preview(companyId, parsedInput.value);
      return c.json({ ok: true, preview });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post('/apply', async (c) => {
    const companyId = requireRouteParam(c.req.param('companyId'), 'companyId');
    const parsedInput = await parseMultipartInput(c.req.raw);
    if (!parsedInput.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedInput.message), 400);
    }

    try {
      const result = await options.catalogImportsService.apply(companyId, parsedInput.value);
      return c.json({ ok: true, result });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  return app;
};
