import { describe, expect, test } from 'bun:test';
import { type AnalyticsSummaryDto, ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import { type AnalyticsPeriod, type AnalyticsService, createDatabaseServiceError } from '../services/analytics';

const API_KEY = "test-api-key";

const baseSummary: AnalyticsSummaryDto = {
  companyId: "company-1",
  period: "today",
  timezone: "Asia/Aden",
  window: {
    startAt: "2026-03-11T21:00:00.000Z",
    endAtExclusive: "2026-03-12T21:00:00.000Z",
  },
  counts: {
    customerMessages: 1,
    assistantMessages: 2,
    totalMessages: 3,
    productSearches: 4,
    clarifications: 5,
    catalogSends: 6,
    imageSends: 7,
    handoffs: 8,
    successfulResponses: 9,
  },
  performance: {
    averageResponseTimeMs: 1200,
  },
  topProducts: [],
};

const createStubAnalyticsService = (
  overrides: Partial<AnalyticsService> = {},
): AnalyticsService => ({
  getSummary: async (_companyId: string, period: AnalyticsPeriod) => ({
    ...baseSummary,
    period,
  }),
  ...overrides,
});

const createTestApp = (analyticsService: AnalyticsService) =>
  createApp({
    analyticsService,
    runtimeConfig: {
      apiKey: API_KEY,
    },
  });

describe("analytics routes", () => {
  test("GET /api/companies/:companyId/analytics defaults period to today", async () => {
    let receivedPeriod: AnalyticsPeriod | undefined;
    const app = createTestApp(createStubAnalyticsService({
      getSummary: async (_companyId, period) => {
        receivedPeriod = period;
        return {
          ...baseSummary,
          period,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/analytics", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPeriod).toBe("today");
    expect(body).toEqual({
      ok: true,
      analytics: baseSummary,
    });
  });

  test("GET /api/companies/:companyId/analytics forwards week and month periods", async () => {
    const periods: AnalyticsPeriod[] = [];
    const app = createTestApp(createStubAnalyticsService({
      getSummary: async (_companyId, period) => {
        periods.push(period);
        return {
          ...baseSummary,
          period,
        };
      },
    }));

    const weekResponse = await app.request("/api/companies/company-1/analytics?period=week", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const monthResponse = await app.request("/api/companies/company-1/analytics?period=month", {
      headers: {
        "x-api-key": API_KEY,
      },
    });

    expect(weekResponse.status).toBe(200);
    expect(monthResponse.status).toBe(200);
    expect(periods).toEqual(["week", "month"]);
  });

  test("GET /api/companies/:companyId/analytics rejects invalid period values", async () => {
    const app = createTestApp(createStubAnalyticsService());

    const response = await app.request("/api/companies/company-1/analytics?period=year", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "period must be one of today, week, month",
      },
    });
  });

  test("GET /api/companies/:companyId/analytics returns 404 for missing companies", async () => {
    const app = createTestApp(createStubAnalyticsService({
      getSummary: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/analytics", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Company not found",
      },
    });
  });

  test("GET /api/companies/:companyId/analytics maps service failures to 503", async () => {
    const app = createTestApp(createStubAnalyticsService({
      getSummary: async () => {
        throw createDatabaseServiceError("Analytics data is temporarily unavailable");
      },
    }));

    const response = await app.request("/api/companies/company-1/analytics", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.DB_QUERY_FAILED,
        message: "Analytics data is temporarily unavailable",
      },
    });
  });
});
