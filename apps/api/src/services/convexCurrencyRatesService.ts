import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import {
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
  type CurrencyRatesService,
  CurrencyRatesServiceError,
  type UpsertCurrencyRateResult,
} from './currencyRates';

export interface ConvexCurrencyRatesServiceOptions {
  createClient?: () => ConvexAdminClient;
}

const ERROR_PREFIXES = new Map<string, (message: string) => CurrencyRatesServiceError>([
  [ERROR_CODES.NOT_FOUND, createNotFoundServiceError],
  [ERROR_CODES.VALIDATION_FAILED, createValidationServiceError],
]);

const parseTaggedError = (message: string): CurrencyRatesServiceError | null => {
  for (const [code, createError] of ERROR_PREFIXES) {
    const marker = `${code}:`;
    const markerIndex = message.indexOf(marker);
    if (markerIndex >= 0) {
      const errorMessage = message.slice(markerIndex + marker.length).trim() || "Request failed";
      return createError(errorMessage);
    }
  }

  return null;
};

const isCurrencyRatesServiceError = (error: unknown): error is CurrencyRatesServiceError =>
  error instanceof CurrencyRatesServiceError;

const normalizeServiceError = (error: unknown): CurrencyRatesServiceError => {
  if (isCurrencyRatesServiceError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const taggedError = parseTaggedError(error.message);
    if (taggedError) {
      return taggedError;
    }

    if (
      error.message.includes("ArgumentValidationError") ||
      error.message.includes("Value does not match validator") ||
      error.message.includes("Invalid argument") ||
      error.message.includes("Unable to decode")
    ) {
      return createValidationServiceError("Invalid company identifier or currency pair");
    }
  }

  return createDatabaseServiceError("Currency rate data is temporarily unavailable");
};

export const createConvexCurrencyRatesService = (
  options: ConvexCurrencyRatesServiceOptions = {},
): CurrencyRatesService => {
  const createClient = options.createClient ?? createConvexAdminClient;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    list: (companyId) =>
      withClient((client) =>
        client.query(convexInternal.currencyRates.list, {
          companyId: companyId as never,
        })
      ),
    upsert: (companyId, input) =>
      withClient((client) =>
        client.mutation(convexInternal.currencyRates.upsert, {
          companyId: companyId as never,
          ...input,
        })
      ) as Promise<UpsertCurrencyRateResult | null>,
  };
};
