import { describe, expect, test } from 'bun:test';
import { parseAnalyticsPeriodQuery } from './analyticsSchemas';

describe("analytics schema parsers", () => {
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

  test("rejects invalid periods", () => {
    expect(parseAnalyticsPeriodQuery("year")).toEqual({
      ok: false,
      message: "period must be one of today, week, month",
    });
  });

  test("rejects empty periods", () => {
    expect(parseAnalyticsPeriodQuery(" ")).toEqual({
      ok: false,
      message: "period must be one of today, week, month",
    });
  });
});
