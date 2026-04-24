import { Hono } from 'hono';
import { ERROR_CODES } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { AnalyticsService } from '../services/analytics';
import { AnalyticsServiceError } from '../services/analytics';
import { parseAnalyticsPeriodQuery } from './analyticsSchemas';
import { requireRouteParam } from './routeParams';

interface AnalyticsRoutesOptions {
  analyticsService: AnalyticsService;
}

const isServiceError = (error: unknown): error is AnalyticsServiceError =>
  error instanceof AnalyticsServiceError;

export const createAnalyticsRoutes = (
  options: AnalyticsRoutesOptions,
) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const parsedPeriod = parseAnalyticsPeriodQuery(c.req.query("period"));

    if (!parsedPeriod.ok) {
      return c.json(createErrorResponse(ERROR_CODES.VALIDATION_FAILED, parsedPeriod.message), 400);
    }

    try {
      const analytics = await options.analyticsService.getSummary(companyId, parsedPeriod.value);
      if (!analytics) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Company not found"), 404);
      }

      return c.json({
        ok: true,
        analytics,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  return app;
};
