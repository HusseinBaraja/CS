import { describe, expect, test } from 'bun:test';
import { ANALYTICS_PERIODS } from '@cs/shared';
import { parseAnalyticsPeriodQuery } from './analyticsSchemas';

describe("analytics schema parsers", () => {
  const invalidPeriodMessage = `period must be one of ${ANALYTICS_PERIODS.join(", ")}`;

  test("defaults missing period to today", () => {
    expect(parseAnalyticsPeriodQuery(undefined)).toEqual({
      ok: true,
      value: "today",
    });
  });

  test("parses each allowed period", () => {
    expect(parseAnalyticsPeriodQuery("today")).toEqual({
      ok: true,
      value: "today",
    });
    expect(parseAnalyticsPeriodQuery("week")).toEqual({
      ok: true,
      value: "week",
    });
    expect(parseAnalyticsPeriodQuery("month")).toEqual({
      ok: true,
      value: "month",
    });
  });

  test("trims whitespace from valid periods", () => {
    expect(parseAnalyticsPeriodQuery(" today ")).toEqual({
      ok: true,
      value: "today",
    });
  });

  test("rejects invalid periods", () => {
    expect(parseAnalyticsPeriodQuery("year")).toEqual({
      ok: false,
      message: invalidPeriodMessage,
    });
  });

  test("rejects empty periods", () => {
    expect(parseAnalyticsPeriodQuery(" ")).toEqual({
      ok: false,
      message: invalidPeriodMessage,
    });
  });
});
