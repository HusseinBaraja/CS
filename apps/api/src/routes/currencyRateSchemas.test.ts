import { describe, expect, test } from 'bun:test';
import { parseCurrencyRatePath, parseUpsertCurrencyRateBody } from './currencyRateSchemas';

describe("currency rate schema parsers", () => {
  test("parseCurrencyRatePath rejects invalid currency codes", () => {
    expect(parseCurrencyRatePath("US", "SAR")).toEqual({
      ok: false,
      message: "fromCurrency must be a 3-letter alphabetic code",
    });
  });

  test("parseCurrencyRatePath rejects identical normalized currencies", () => {
    expect(parseCurrencyRatePath("sar", "SAR")).toEqual({
      ok: false,
      message: "fromCurrency and toCurrency must be different",
    });
  });

  test("parseUpsertCurrencyRateBody rejects missing rates", () => {
    expect(parseUpsertCurrencyRateBody({})).toEqual({
      ok: false,
      message: "rate must be a finite positive number",
    });
  });
});
