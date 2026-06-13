import { normalizeCurrencyCode } from '@cs/shared';
import type { ParseResult } from './parserUtils';

export const parseCurrencyCode = (value: unknown): ParseResult<string | undefined> => {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      message: "operatingCurrency must be a 3-letter currency code",
    };
  }

  const normalized = normalizeCurrencyCode(value);
  if (!normalized) {
    return {
      ok: false,
      message: "operatingCurrency must be a 3-letter currency code",
    };
  }

  return { ok: true, value: normalized };
};
