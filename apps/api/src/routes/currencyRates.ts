import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { CurrencyRatesService } from '../services/currencyRates';
import { CurrencyRatesServiceError } from '../services/currencyRates';
import { parseCurrencyRatePath, parseUpsertCurrencyRateBody } from './currencyRateSchemas';
import { parseJsonBody } from './parserUtils';

export interface CurrencyRatesRoutesOptions {
  currencyRatesService: CurrencyRatesService;
}

const isServiceError = (error: unknown): error is CurrencyRatesServiceError =>
  error instanceof CurrencyRatesServiceError;

const requireParam = (value: string | undefined): string => {
  if (!value) {
    throw new Error("Missing route parameter");
  }

  return value;
};

export const createCurrencyRatesRoutes = (
  options: CurrencyRatesRoutesOptions,
) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const companyId = requireParam(c.req.param("companyId"));

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
    const companyId = requireParam(c.req.param("companyId"));
    const fromCurrency = requireParam(c.req.param("fromCurrency"));
    const toCurrency = requireParam(c.req.param("toCurrency"));
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
