import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { ERROR_CODES, ValidationError } from '@cs/shared';
import { createApiKeyAuthMiddleware } from '../auth';
import { createCustomErrorResponse, createErrorResponse } from '../responses';
import {
  type CurrencyRateDto,
  type CurrencyRatesService,
  type UpsertCurrencyRateInput,
  type UpsertCurrencyRateResult,
} from '../services/currencyRates';
import { createCurrencyRatesRoutes } from './currencyRates';

const API_KEY = "test-api-key";

const baseCurrencyRate: CurrencyRateDto = {
  companyId: "company-1",
  fromCurrency: "USD",
  toCurrency: "SAR",
  rate: 3.75,
};

const authHeaders = {
  "x-api-key": API_KEY,
  "content-type": "application/json",
};

const createStubCurrencyRatesService = (
  overrides: Partial<CurrencyRatesService> = {},
): CurrencyRatesService => ({
  list: async () => [],
  upsert: async (_companyId: string, input: UpsertCurrencyRateInput): Promise<UpsertCurrencyRateResult> => ({
    created: true,
    currencyRate: {
      companyId: "company-1",
      ...input,
    },
  }),
  ...overrides,
});

const createTestApp = (currencyRatesService: CurrencyRatesService) =>
  {
    const app = new Hono();

    app.use("*", createApiKeyAuthMiddleware({ apiKey: API_KEY }));

    app.onError((error, c) => {
      if (error instanceof SyntaxError) {
        return c.json(
          createErrorResponse(ERROR_CODES.VALIDATION_FAILED, "Malformed JSON body"),
          400,
        );
      }

      if (error instanceof ValidationError) {
        return c.json(
          createErrorResponse(ERROR_CODES.VALIDATION_FAILED, error.message),
          400,
        );
      }

      return c.json(
        createCustomErrorResponse("INTERNAL_SERVER_ERROR", "Internal server error"),
        500,
      );
    });

    app.route(
      "/api/companies/:companyId/currency-rates",
      createCurrencyRatesRoutes({ currencyRatesService }),
    );

    app.notFound((c) =>
      c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Route not found"), 404),
    );

    return app;
  };

describe("currency rate routes", () => {
  test("GET /api/companies/:companyId/currency-rates returns the stored rates", async () => {
    const app = createTestApp(createStubCurrencyRatesService({
      list: async () => [baseCurrencyRate],
    }));

    const response = await app.request("/api/companies/company-1/currency-rates", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      currencyRates: [baseCurrencyRate],
    });
  });

  test("GET /api/companies/:companyId/currency-rates returns 404 when the company does not exist", async () => {
    const app = createTestApp(createStubCurrencyRatesService({
      list: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/currency-rates", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Company not found",
      },
    });
  });

  test("PUT /api/companies/:companyId/currency-rates/:from/:to returns 201 on create", async () => {
    let receivedInput: UpsertCurrencyRateInput | undefined;
    const app = createTestApp(createStubCurrencyRatesService({
      upsert: async (_companyId, input) => {
        receivedInput = input;
        return {
          created: true,
          currencyRate: {
            companyId: "company-1",
            ...input,
          },
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/currency-rates/usd/sar", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        rate: 3.75,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(receivedInput).toEqual({
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.75,
    });
    expect(body).toEqual({
      ok: true,
      result: {
        created: true,
        currencyRate: baseCurrencyRate,
      },
    });
  });

  test("PUT /api/companies/:companyId/currency-rates/:from/:to returns 200 on update", async () => {
    const app = createTestApp(createStubCurrencyRatesService({
      upsert: async () => ({
        created: false,
        currencyRate: {
          companyId: "company-1",
          fromCurrency: "USD",
          toCurrency: "SAR",
          rate: 3.8,
        },
      }),
    }));

    const response = await app.request("/api/companies/company-1/currency-rates/USD/SAR", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        rate: 3.8,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      result: {
        created: false,
        currencyRate: {
          companyId: "company-1",
          fromCurrency: "USD",
          toCurrency: "SAR",
          rate: 3.8,
        },
      },
    });
  });

  test("PUT /api/companies/:companyId/currency-rates/:from/:to rejects invalid rates", async () => {
    const app = createTestApp(createStubCurrencyRatesService());

    const response = await app.request("/api/companies/company-1/currency-rates/USD/SAR", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        rate: 0,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "rate must be a finite positive number",
      },
    });
  });

  test("PUT /api/companies/:companyId/currency-rates/:from/:to rejects invalid currency codes", async () => {
    const app = createTestApp(createStubCurrencyRatesService());

    const response = await app.request("/api/companies/company-1/currency-rates/US/SAR", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        rate: 3.75,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "fromCurrency must be a 3-letter alphabetic code",
      },
    });
  });
});
