import type { Context } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import { ProductsServiceError } from '../services/products';
import { parseJsonBody, type ParseResult } from './parserUtils';
import { requireRouteParam } from './routeParams';

export const productRouteParams = (c: Context) => ({
  companyId: requireRouteParam(c.req.param('companyId'), 'companyId'),
  productId: requireRouteParam(c.req.param('id'), 'id'),
});

export const parseRouteJson = async <T>(
  c: Context,
  parser: (value: unknown) => ParseResult<T>,
): Promise<
  | { ok: true; value: T }
  | { ok: false; response: Response }
> => {
  const parsedJson = await parseJsonBody(c.req.raw);
  if (!parsedJson.ok) {
    return {
      ok: false,
      response: c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400),
    };
  }

  const parsedBody = parser(parsedJson.value);
  if (!parsedBody.ok) {
    return {
      ok: false,
      response: c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400),
    };
  }

  return parsedBody;
};

export const handleProductsServiceError = (c: Context, error: unknown): Response => {
  if (error instanceof ProductsServiceError) {
    return c.json(createErrorResponse(error.code, error.message), error.status);
  }

  throw error;
};
