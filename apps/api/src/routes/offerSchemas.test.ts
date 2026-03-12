import { describe, expect, test } from 'bun:test';
import { parseCreateOfferBody, parseListOffersQuery, parseUpdateOfferBody } from './offerSchemas';

describe("offer schema parsers", () => {
  test("parseListOffersQuery accepts true and false", () => {
    expect(parseListOffersQuery("true")).toEqual({
      ok: true,
      value: {
        activeOnly: true,
      },
    });

    expect(parseListOffersQuery("false")).toEqual({
      ok: true,
      value: {
        activeOnly: false,
      },
    });
  });

  test("parseListOffersQuery rejects invalid booleans", () => {
    expect(parseListOffersQuery("maybe")).toEqual({
      ok: false,
      message: "activeOnly must be true or false",
    });
  });

  test("parseCreateOfferBody accepts valid offer payloads", () => {
    expect(parseCreateOfferBody({
      contentEn: "Weekend sale",
      contentAr: "عرض نهاية الأسبوع",
      active: true,
      startDate: "2026-03-12T00:00:00.000Z",
      endDate: "2026-03-13T00:00:00.000Z",
    })).toEqual({
      ok: true,
      value: {
        contentEn: "Weekend sale",
        contentAr: "عرض نهاية الأسبوع",
        active: true,
        startDate: "2026-03-12T00:00:00.000Z",
        endDate: "2026-03-13T00:00:00.000Z",
      },
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

  test("parseUpdateOfferBody accepts valid partial updates", () => {
    expect(parseUpdateOfferBody({
      contentEn: "Updated",
    })).toEqual({
      ok: true,
      value: {
        contentEn: "Updated",
      },
    });
  });

  test("parseUpdateOfferBody rejects an empty body", () => {
    expect(parseUpdateOfferBody({})).toEqual({
      ok: false,
      message: "Request body must include at least one updatable field",
    });
  });
});
