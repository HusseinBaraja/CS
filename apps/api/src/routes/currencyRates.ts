import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { CurrencyRatesService } from '../services/currencyRates';
import { CurrencyRatesServiceError } from '../services/currencyRates';
import { parseCurrencyRatePath, parseUpsertCurrencyRateBody } from './currencyRateSchemas';
import { parseJsonBody } from './parserUtils';
import { requireRouteParam } from './routeParams';

interface CurrencyRatesRoutesOptions {
  currencyRatesService: CurrencyRatesService;
}

const isServiceError = (error: unknown): error is CurrencyRatesServiceError =>
  error instanceof CurrencyRatesServiceError;

export const createCurrencyRatesRoutes = (
  options: CurrencyRatesRoutesOptions,
) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");

    try {
      const currencyRates = await options.currencyRatesService.list(companyId);
      if (!currencyRates) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        currencyRates,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.put("/:fromCurrency/:toCurrency", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const fromCurrency = requireRouteParam(c.req.param("fromCurrency"), "fromCurrency");
    const toCurrency = requireRouteParam(c.req.param("toCurrency"), "toCurrency");
    const parsedPath = parseCurrencyRatePath(fromCurrency, toCurrency);
    if (!parsedPath.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedPath.message), 400);
    }

    const parsedJson = await parseJsonBody(c.req.raw);
    if (!parsedJson.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedJson.message), 400);
    }

    const parsedBody = parseUpsertCurrencyRateBody(parsedJson.value);
    if (!parsedBody.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedBody.message), 400);
    }

    try {
      const result = await options.currencyRatesService.upsert(companyId, {
        ...parsedPath.value,
        ...parsedBody.value,
      });
      if (!result) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        result,
      }, result.created ? 201 : 200);
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  return app;
};
