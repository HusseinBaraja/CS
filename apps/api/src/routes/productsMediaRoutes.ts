import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { ProductMediaService } from '../services/productMedia';
import { ProductMediaServiceError } from '../services/productMedia';
import { parseCreateProductImageUploadBody } from './productSchemas';
import { parseJsonBody } from './parserUtils';
import { productRouteParams } from './productSubresourceRouteHelpers';
import { requireRouteParam } from './routeParams';

interface ProductsMediaRoutesOptions {
  productMediaService: ProductMediaService;
}

const handleProductMediaServiceError = (error: unknown): Response => {
  if (error instanceof ProductMediaServiceError) {
    return Response.json(createErrorResponse(error.code, error.message), { status: error.status });
  }

  throw error;
};

export const createProductsMediaRoutes = (options: ProductsMediaRoutesOptions) => {
  const app = new Hono();

  app.post('/uploads', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const parsedJson = await parseJsonBody(c.req.raw);
    if (!parsedJson.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400);
    }

    const parsedBody = parseCreateProductImageUploadBody(parsedJson.value);
    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const upload = await options.productMediaService.createUpload(companyId, productId, parsedBody.value);
      if (!upload) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, upload }, 201);
    } catch (error) {
      return handleProductMediaServiceError(error);
    }
  });

  app.post('/uploads/:uploadId/complete', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const uploadId = requireRouteParam(c.req.param('uploadId'), 'uploadId');

    try {
      const image = await options.productMediaService.completeUpload(companyId, productId, uploadId);
      if (!image) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Upload session not found'), 404);
      }

      return c.json({ ok: true, image });
    } catch (error) {
      return handleProductMediaServiceError(error);
    }
  });

  app.delete('/:imageId', async (c) => {
    const { companyId, productId } = productRouteParams(c);
    const imageId = requireRouteParam(c.req.param('imageId'), 'imageId');

    try {
      const deleted = await options.productMediaService.deleteImage(companyId, productId, imageId);
      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Product not found'), 404);
      }

      return c.json({ ok: true, deleted });
    } catch (error) {
      return handleProductMediaServiceError(error);
    }
  });

  return app;
};
