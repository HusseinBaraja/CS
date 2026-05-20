import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { CompaniesService } from '../services/companies';
import { CompaniesServiceError } from '../services/companies';
import { parseCreateCompanyBody, parseUpdateCompanyBody } from './companySchemas';

interface CompaniesRoutesOptions {
  companiesService: CompaniesService;
}

const isServiceError = (error: unknown): error is CompaniesServiceError =>
  error instanceof CompaniesServiceError;

export const createCompaniesRoutes = (
  options: CompaniesRoutesOptions,
) => {
  const app = new Hono();

  app.get("/", async (c) => {
    try {
      const companies = await options.companiesService.list();
      return c.json({
        ok: true,
        companies,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.get("/:companyId", async (c) => {
    try {
      const company = await options.companiesService.get(c.req.param("companyId"));
      if (!company) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        company,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const parsedBody = parseCreateCompanyBody(body);

    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const company = await options.companiesService.create(parsedBody.value);
      return c.json({
        ok: true,
        company,
      }, 201);
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.put("/:companyId", async (c) => {
    const body = await c.req.json();
    const parsedBody = parseUpdateCompanyBody(body);

    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const company = await options.companiesService.update(
        c.req.param("companyId"),
        parsedBody.value,
      );

      if (!company) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        company,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.delete("/:companyId", async (c) => {
    try {
      const deleted = await options.companiesService.delete(c.req.param("companyId"));
      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
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
