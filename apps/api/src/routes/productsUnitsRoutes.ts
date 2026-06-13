import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { ProductsService } from '../services/products';
import { parseCreateUnitBody, parseUpdateUnitBody } from './productVariantParsers';
import {
  handleProductsServiceError,
  parseRouteJson,
  productRouteParams,
} from './productSubresourceRouteHelpers';
import { requireRouteParam } from './routeParams';

interface ProductsUnitsRoutesOptions {
  productsService: ProductsService;
}

export const createProductsUnitsRoutes = (options: ProductsUnitsRoutesOptions) => {
  const app = new Hono();

  app.get('/', async (c) => {
    const { companyId, productId } = productRouteParams(c);

    try {
      const units = await options.productsService.listUnits(companyId, productId);
      if (!units) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, units });
    } catch (error) {
      return handleProductsServiceError(c, error);
    }
  });

  app.post('/', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const parsedBody = await parseRouteJson(c, parseCreateUnitBody);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    try {
      const unit = await options.productsService.createUnit(companyId, productId, parsedBody.value);
      if (!unit) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, unit }, 201);
    } catch (error) {
      return handleProductsServiceError(c, error);
    }
  });

  app.put('/:unitId', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const unitId = requireRouteParam(c.req.param('unitId'), 'unitId');
    const parsedBody = await parseRouteJson(c, parseUpdateUnitBody);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    try {
      const unit = await options.productsService.updateUnit(companyId, productId, unitId, parsedBody.value);
      if (!unit) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, unit });
    } catch (error) {
      return handleProductsServiceError(c, error);
    }
  });

  app.delete('/:unitId', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const unitId = requireRouteParam(c.req.param('unitId'), 'unitId');

    try {
      const deleted = await options.productsService.deleteUnit(companyId, productId, unitId);
      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, deleted });
    } catch (error) {
      return handleProductsServiceError(c, error);
    }
  });

  return app;
};
