import { type AnalyticsPeriod, type AnalyticsSummaryDto, ERROR_CODES, type ErrorCode } from '@cs/shared';

export type { AnalyticsPeriod, AnalyticsSummaryDto } from '@cs/shared';

export interface AnalyticsService {
  getSummary(companyId: string, period: AnalyticsPeriod): Promise<AnalyticsSummaryDto | null>;
}

export class AnalyticsServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 503;

  constructor(
    code: ErrorCode,
    message: string,
    status: 400 | 503,
  ) {
    super(message);
    this.name = "AnalyticsServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createValidationServiceError = (message: string): AnalyticsServiceError =>
  new AnalyticsServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createDatabaseServiceError = (message: string): AnalyticsServiceError =>
  new AnalyticsServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
