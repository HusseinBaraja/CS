import { ERROR_CODES, type ErrorCode } from '@cs/shared';

export interface CurrencyRateDto {
  companyId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}

export interface UpsertCurrencyRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}

export interface UpsertCurrencyRateResult {
  created: boolean;
  currencyRate: CurrencyRateDto;
}

export interface CurrencyRatesService {
  list(companyId: string): Promise<CurrencyRateDto[] | null>;
  upsert(companyId: string, input: UpsertCurrencyRateInput): Promise<UpsertCurrencyRateResult | null>;
}

export class CurrencyRatesServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 404 | 503;

  constructor(
    code: ErrorCode,
    message: string,
    status: 400 | 404 | 503,
  ) {
    super(message);
    this.name = "CurrencyRatesServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createValidationServiceError = (message: string): CurrencyRatesServiceError =>
  new CurrencyRatesServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createNotFoundServiceError = (message: string): CurrencyRatesServiceError =>
  new CurrencyRatesServiceError(ERROR_CODES.NOT_FOUND, message, 404);

export const createDatabaseServiceError = (message: string): CurrencyRatesServiceError =>
  new CurrencyRatesServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
