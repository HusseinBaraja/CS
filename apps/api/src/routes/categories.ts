import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { CategoriesService } from '../services/categories';
import { CategoriesServiceError } from '../services/categories';
import { parseCreateCategoryBody, parseUpdateCategoryBody } from './categorySchemas';

export interface CategoriesRoutesOptions {
  categoriesService: CategoriesService;
}

const isServiceError = (error: unknown): error is CategoriesServiceError =>
  error instanceof CategoriesServiceError;

const requireParam = (value: string | undefined): string => {
  if (!value) {
    throw new Error("Missing route parameter");
  }

  return value;
};

export const createCategoriesRoutes = (
  options: CategoriesRoutesOptions,
) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const companyId = requireParam(c.req.param("companyId"));

    try {
      const categories = await options.categoriesService.list(companyId);
      if (!categories) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        categories,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.get("/:id", async (c) => {
    const companyId = requireParam(c.req.param("companyId"));
    const categoryId = requireParam(c.req.param("id"));

    try {
      const category = await options.categoriesService.get(companyId, categoryId);

      if (!category) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Category not found"), 404);
      }

      return c.json({
        ok: true,
        category,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post("/", async (c) => {
    const companyId = requireParam(c.req.param("companyId"));
    const body = await c.req.json();
    const parsedBody = parseCreateCategoryBody(body);

    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const category = await options.categoriesService.create(companyId, parsedBody.value);
      if (!category) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        category,
      }, 201);
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.put("/:id", async (c) => {
    const companyId = requireParam(c.req.param("companyId"));
    const categoryId = requireParam(c.req.param("id"));
    const body = await c.req.json();
    const parsedBody = parseUpdateCategoryBody(body);

    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const category = await options.categoriesService.update(companyId, categoryId, parsedBody.value);

      if (!category) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Category not found"), 404);
      }

      return c.json({
        ok: true,
        category,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.delete("/:id", async (c) => {
    const companyId = requireParam(c.req.param("companyId"));
    const categoryId = requireParam(c.req.param("id"));

    try {
      const deleted = await options.categoriesService.delete(companyId, categoryId);

      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Category not found"), 404);
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
