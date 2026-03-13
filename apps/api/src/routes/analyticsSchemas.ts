import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '@cs/shared';
import type { ParseResult } from './parserUtils';

const PERIOD_SET = new Set<string>(ANALYTICS_PERIODS);
const INVALID_PERIOD_MESSAGE = `period must be one of ${ANALYTICS_PERIODS.join(", ")}`;

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
      message: INVALID_PERIOD_MESSAGE,
    };
  }

  return {
    ok: true,
    value: normalized as AnalyticsPeriod,
  };
};
