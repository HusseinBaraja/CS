import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '@cs/shared';
import type { ParseResult } from './parserUtils';

const PERIOD_SET = new Set<string>(ANALYTICS_PERIODS);

export const parseAnalyticsPeriodQuery = (
  value: string | undefined,
): ParseResult<AnalyticsPeriod> => {
  if (value === undefined) {
    return {
      ok: true,
      value: "today",
    };
  }

  const normalized = value.trim();
  if (!PERIOD_SET.has(normalized)) {
    return {
      ok: false,
      message: "period must be one of today, week, month",
    };
  }

  return {
    ok: true,
    value: normalized as AnalyticsPeriod,
  };
};
