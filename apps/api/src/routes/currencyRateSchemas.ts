import type { UpsertCurrencyRateInput } from '../services/currencyRates';
import { parseObject, type ParseResult } from './parserUtils';

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u;

const parseCurrencyCode = (value: string, fieldName: string): ParseResult<string> => {
  const normalized = value.trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(normalized)) {
    return {
      ok: false,
      message: `${fieldName} must be a 3-letter alphabetic code`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
};

export const parseCurrencyRatePath = (
  fromCurrency: string,
  toCurrency: string,
): ParseResult<Pick<UpsertCurrencyRateInput, "fromCurrency" | "toCurrency">> => {
  const parsedFromCurrency = parseCurrencyCode(fromCurrency, "fromCurrency");
  if (!parsedFromCurrency.ok) {
    return parsedFromCurrency;
  }

  const parsedToCurrency = parseCurrencyCode(toCurrency, "toCurrency");
  if (!parsedToCurrency.ok) {
    return parsedToCurrency;
  }

  if (parsedFromCurrency.value === parsedToCurrency.value) {
    return {
      ok: false,
      message: "fromCurrency and toCurrency must be different",
    };
  }

  return {
    ok: true,
    value: {
      fromCurrency: parsedFromCurrency.value,
      toCurrency: parsedToCurrency.value,
    },
  };
};

export const parseUpsertCurrencyRateBody = (
  value: unknown,
): ParseResult<Pick<UpsertCurrencyRateInput, "rate">> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  if (
    typeof parsedObject.value.rate !== "number" ||
    !Number.isFinite(parsedObject.value.rate) ||
    parsedObject.value.rate <= 0
  ) {
    return {
      ok: false,
      message: "rate must be a finite positive number",
    };
  }

  return {
    ok: true,
    value: {
      rate: parsedObject.value.rate,
    },
  };
};
