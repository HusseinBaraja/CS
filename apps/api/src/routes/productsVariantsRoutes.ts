import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { ProductsService } from '../services/products';
import { parseCreateVariantBody, parseUpdateVariantBody } from './productVariantParsers';
import {
  handleProductsServiceError,
  parseRouteJson,
  productRouteParams,
} from './productSubresourceRouteHelpers';
import { requireRouteParam } from './routeParams';

interface ProductsVariantsRoutesOptions {
  productsService: ProductsService;
}

export const createProductsVariantsRoutes = (options: ProductsVariantsRoutesOptions) => {
  const app = new Hono();

  app.get('/', async (c) => {
    const { companyId, productId } = productRouteParams(c);

    try {
      const variants = await options.productsService.listVariants(companyId, productId);
      if (!variants) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, variants });
    } catch (error) {
      return handleProductsServiceError(c, error);
    }
  });

  app.post('/', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const parsedBody = await parseRouteJson(c, parseCreateVariantBody);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    try {
      const variant = await options.productsService.createVariant(companyId, productId, parsedBody.value);
      if (!variant) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, variant }, 201);
    } catch (error) {
      return handleProductsServiceError(c, error);
    }
  });

  app.put('/:variantId', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const variantId = requireRouteParam(c.req.param('variantId'), 'variantId');
    const parsedBody = await parseRouteJson(c, parseUpdateVariantBody);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    try {
      const variant = await options.productsService.updateVariant(
        companyId,
        productId,
        variantId,
        parsedBody.value,
      );
      if (!variant) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, variant });
    } catch (error) {
      return handleProductsServiceError(c, error);
    }
  });

  app.delete('/:variantId', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const variantId = requireRouteParam(c.req.param('variantId'), 'variantId');

    try {
      const deleted = await options.productsService.deleteVariant(companyId, productId, variantId);
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
