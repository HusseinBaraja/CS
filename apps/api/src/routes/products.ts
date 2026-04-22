import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import {
  parseCreateProductBody,
  parseCreateProductImageUploadBody,
  parseCreateVariantBody,
  parseListProductsQuery,
  parseUpdateProductBody,
  parseUpdateVariantBody,
} from './productSchemas';
import type { ProductMediaService } from '../services/productMedia';
import { ProductMediaServiceError } from '../services/productMedia';
import type { ProductsService } from '../services/products';
import { ProductsServiceError } from '../services/products';
import { parseJsonBody } from './parserUtils';
import { requireRouteParam } from './routeParams';

interface ProductsRoutesOptions {
  productsService: ProductsService;
  productMediaService: ProductMediaService;
}

const isServiceError = (error: unknown): error is ProductsServiceError =>
  error instanceof ProductsServiceError;

const isProductMediaServiceError = (error: unknown): error is ProductMediaServiceError =>
  error instanceof ProductMediaServiceError;

export const createProductsRoutes = (
  options: ProductsRoutesOptions,
) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const parsedQuery = parseListProductsQuery(
      c.req.query("categoryId"),
      c.req.query("search"),
    );

    if (!parsedQuery.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedQuery.message), 400);
    }

    try {
      const products = await options.productsService.list(companyId, parsedQuery.value);
      if (!products) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        products,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.get("/:id", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");

    try {
      const product = await options.productsService.get(companyId, productId);
      if (!product) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        product,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post("/", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const parsedJson = await parseJsonBody(c.req.raw);
    if (!parsedJson.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400);
    }

    const parsedBody = parseCreateProductBody(parsedJson.value);

    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const product = await options.productsService.create(companyId, parsedBody.value);

      return c.json({
        ok: true,
        product,
      }, 201);
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.put("/:id", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");
    const parsedJson = await parseJsonBody(c.req.raw);
    if (!parsedJson.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400);
    }

    const parsedBody = parseUpdateProductBody(parsedJson.value);

    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const product = await options.productsService.update(companyId, productId, parsedBody.value);
      if (!product) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        product,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.delete("/:id", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");

    try {
      const deleted = await options.productsService.delete(companyId, productId);
      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        deleted,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post("/:id/images/uploads", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");
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
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        upload,
      }, 201);
    } catch (error) {
      if (isProductMediaServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post("/:id/images/uploads/:uploadId/complete", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");
    const uploadId = requireRouteParam(c.req.param("uploadId"), "uploadId");

    try {
      const image = await options.productMediaService.completeUpload(companyId, productId, uploadId);
      if (!image) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Upload session not found"), 404);
      }

      return c.json({
        ok: true,
        image,
      });
    } catch (error) {
      if (isProductMediaServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.delete("/:id/images/:imageId", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");
    const imageId = requireRouteParam(c.req.param("imageId"), "imageId");

    try {
      const deleted = await options.productMediaService.deleteImage(companyId, productId, imageId);
      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        deleted,
      });
    } catch (error) {
      if (isProductMediaServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.get("/:id/variants", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");

    try {
      const variants = await options.productsService.listVariants(companyId, productId);
      if (!variants) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        variants,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post("/:id/variants", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");
    const parsedJson = await parseJsonBody(c.req.raw);
    if (!parsedJson.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400);
    }

    const parsedBody = parseCreateVariantBody(parsedJson.value);
    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const variant = await options.productsService.createVariant(companyId, productId, parsedBody.value);
      if (!variant) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        variant,
      }, 201);
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.put("/:id/variants/:variantId", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");
    const variantId = requireRouteParam(c.req.param("variantId"), "variantId");
    const parsedJson = await parseJsonBody(c.req.raw);
    if (!parsedJson.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400);
    }

    const parsedBody = parseUpdateVariantBody(parsedJson.value);
    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const variant = await options.productsService.updateVariant(
        companyId,
        productId,
        variantId,
        parsedBody.value,
      );
      if (!variant) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        variant,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.delete("/:id/variants/:variantId", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const productId = requireRouteParam(c.req.param("id"), "id");
    const variantId = requireRouteParam(c.req.param("variantId"), "variantId");

    try {
      const deleted = await options.productsService.deleteVariant(companyId, productId, variantId);
      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Product not found"), 404);
      }

      return c.json({
        ok: true,
        deleted,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  return app;
};
