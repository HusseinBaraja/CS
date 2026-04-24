import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { OffersService } from '../services/offers';
import { OffersServiceError } from '../services/offers';
import { parseCreateOfferBody, parseListOffersQuery, parseUpdateOfferBody } from './offerSchemas';
import { parseJsonBody } from './parserUtils';
import { requireRouteParam } from './routeParams';

interface OffersRoutesOptions {
  offersService: OffersService;
}

const isServiceError = (error: unknown): error is OffersServiceError =>
  error instanceof OffersServiceError;

export const createOffersRoutes = (
  options: OffersRoutesOptions,
) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const parsedQuery = parseListOffersQuery(c.req.query("activeOnly"));

    if (!parsedQuery.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedQuery.message), 400);
    }

    try {
      const offers = await options.offersService.list(companyId, parsedQuery.value);
      if (!offers) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        offers,
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

    const parsedBody = parseCreateOfferBody(parsedJson.value);
    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const offer = await options.offersService.create(companyId, parsedBody.value);
      if (!offer) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        offer,
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
    const offerId = requireRouteParam(c.req.param("id"), "id");
    const parsedJson = await parseJsonBody(c.req.raw);
    if (!parsedJson.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400);
    }

    const parsedBody = parseUpdateOfferBody(parsedJson.value);
    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const offer = await options.offersService.update(companyId, offerId, parsedBody.value);
      if (!offer) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Offer not found"), 404);
      }

      return c.json({
        ok: true,
        offer,
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
    const offerId = requireRouteParam(c.req.param("id"), "id");

    try {
      const deleted = await options.offersService.delete(companyId, offerId);
      if (!deleted) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Offer not found"), 404);
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
