import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import {
  type AnalyticsPeriod,
  type AnalyticsService,
  AnalyticsServiceError,
  type AnalyticsSummaryDto,
  createDatabaseServiceError,
  createValidationServiceError,
} from './analytics';

export interface ConvexAnalyticsServiceOptions {
  createClient?: () => ConvexAdminClient;
}

const isAnalyticsServiceError = (error: unknown): error is AnalyticsServiceError =>
  error instanceof AnalyticsServiceError;

const normalizeServiceError = (error: unknown): AnalyticsServiceError => {
  if (isAnalyticsServiceError(error)) {
    return error;
  }

  if (
    error instanceof Error &&
    (
      error.message.includes("ArgumentValidationError") ||
      error.message.includes("Value does not match validator") ||
      error.message.includes("Invalid argument") ||
      error.message.includes("Unable to decode")
    )
  ) {
    return createValidationServiceError("Invalid company identifier or analytics period");
  }

  return createDatabaseServiceError("Analytics data is temporarily unavailable");
};

export const createConvexAnalyticsService = (
  options: ConvexAnalyticsServiceOptions = {},
): AnalyticsService => {
  const createClient = options.createClient ?? createConvexAdminClient;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    getSummary: (companyId: string, period: AnalyticsPeriod) =>
      withClient((client) =>
        client.query(convexInternal.analytics.summary, {
          companyId: companyId as never,
          period,
        })
      ) as Promise<AnalyticsSummaryDto | null>,
  };
};
