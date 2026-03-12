import { describe, expect, test } from 'bun:test';
import { parseCreateOfferBody, parseListOffersQuery, parseUpdateOfferBody } from './offerSchemas';

describe("offer schema parsers", () => {
  test("parseListOffersQuery rejects invalid booleans", () => {
    expect(parseListOffersQuery("maybe")).toEqual({
      ok: false,
      message: "activeOnly must be true or false",
    });
  });

  test("parseCreateOfferBody rejects malformed dates", () => {
    expect(parseCreateOfferBody({
      contentEn: "Weekend sale",
      active: true,
      startDate: "2026-03-12",
    })).toEqual({
      ok: false,
      message: "startDate must be a valid ISO 8601 date-time string",
    });
  });

  test("parseUpdateOfferBody rejects an empty body", () => {
    expect(parseUpdateOfferBody({})).toEqual({
      ok: false,
      message: "Request body must include at least one updatable field",
    });
  });
});
