import { describe, expect, test } from 'bun:test';
import { convexInternal } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import { getFunctionName } from 'convex/server';
import { createConvexCurrencyRatesService } from './convexCurrencyRatesService';
import { createDatabaseServiceError, createValidationServiceError, CurrencyRatesServiceError } from './currencyRates';

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient) =>
  createConvexCurrencyRatesService({
    createClient: () => client as never,
  });

describe("createConvexCurrencyRatesService", () => {
  test("uses the internal Convex currency-rates references", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return [];
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1")).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.currencyRates.list),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
    });
  });

  test("uses the internal Convex upsert reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return {
          created: true,
          currencyRate: {
            companyId: "company-1",
            fromCurrency: "USD",
            toCurrency: "SAR",
            rate: 3.75,
          },
        };
      },
    });

    await expect(service.upsert("company-1", {
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.75,
    })).resolves.toEqual({
      created: true,
      currencyRate: {
        companyId: "company-1",
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.75,
      },
    });
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.currencyRates.upsert),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.75,
    });
  });

  test("rethrows existing CurrencyRatesServiceError instances unchanged", async () => {
    const error = new CurrencyRatesServiceError(
      ERROR_CODES.VALIDATION_FAILED,
      "rate must be a finite positive number",
      400,
    );
    const service = createService({
      query: async () => {
        throw error;
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1")).rejects.toBe(error);
  });

  test("maps tagged Convex errors to validation service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("VALIDATION_FAILED: fromCurrency and toCurrency must be different");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1")).rejects.toEqual(
      createValidationServiceError("fromCurrency and toCurrency must be different"),
    );
  });

  test("maps unknown errors to database unavailable errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("socket hang up");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1")).rejects.toEqual(
      createDatabaseServiceError("Currency rate data is temporarily unavailable"),
    );
  });
});
