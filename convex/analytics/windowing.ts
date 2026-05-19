import type { Doc } from '../_generated/dataModel';
import type { AnalyticsPeriod } from '@cs/shared';

type AnalyticsEventDoc = Doc<'analyticsEvents'>;

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type LocalDate = Pick<LocalDateTime, 'year' | 'month' | 'day'>;

export type AnalyticsWindow = {
  startMs: number;
  endMs: number;
  startAt: string;
  endAtExclusive: string;
};

export const TIMEZONE_QUERY_BUFFER_MS = 14 * 60 * 60 * 1000;

const localDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getLocalDateTimeFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = localDateTimeFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  localDateTimeFormatterCache.set(timeZone, formatter);
  return formatter;
};

const getLocalDateTime = (timestamp: number, timeZone: string): LocalDateTime => {
  const parts = getLocalDateTimeFormatter(timeZone).formatToParts(new Date(timestamp));

  const readPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((entry) => entry.type === type)?.value;
    if (!part) {
      throw new Error(`Missing ${type} when formatting date`);
    }

    return Number(part);
  };

  return {
    year: readPart('year'),
    month: readPart('month'),
    day: readPart('day'),
    hour: readPart('hour'),
    minute: readPart('minute'),
    second: readPart('second'),
  };
};

const addDays = (date: LocalDate, days: number): LocalDate => {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const getStartOfWeek = (date: LocalDate): LocalDate => {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addDays(date, -daysSinceMonday);
};

const getStartOfMonth = (date: LocalDate): LocalDate => ({
  year: date.year,
  month: date.month,
  day: 1,
});

const getStartOfNextMonth = (date: LocalDate): LocalDate =>
  date.month === 12
    ? {
      year: date.year + 1,
      month: 1,
      day: 1,
    }
    : {
      year: date.year,
      month: date.month + 1,
      day: 1,
    };

const localDateTimeToUtc = (dateTime: LocalDateTime, timeZone: string): number => {
  const targetUtcMs = Date.UTC(
    dateTime.year,
    dateTime.month - 1,
    dateTime.day,
    dateTime.hour,
    dateTime.minute,
    dateTime.second,
    0,
  );

  let guess = targetUtcMs;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resolved = getLocalDateTime(guess, timeZone);
    const resolvedUtcMs = Date.UTC(
      resolved.year,
      resolved.month - 1,
      resolved.day,
      resolved.hour,
      resolved.minute,
      resolved.second,
      0,
    );
    const difference = targetUtcMs - resolvedUtcMs;

    if (difference === 0) {
      return guess;
    }

    guess += difference;
  }

  return guess;
};

export const getWindow = (timeZone: string, period: AnalyticsPeriod, now: number): AnalyticsWindow => {
  const nowLocal = getLocalDateTime(now, timeZone);
  const today: LocalDate = {
    year: nowLocal.year,
    month: nowLocal.month,
    day: nowLocal.day,
  };

  let startDate = today;
  let endDate = addDays(today, 1);

  if (period === 'week') {
    startDate = getStartOfWeek(today);
    endDate = addDays(startDate, 7);
  } else if (period === 'month') {
    startDate = getStartOfMonth(today);
    endDate = getStartOfNextMonth(today);
  }

  const startMs = localDateTimeToUtc({
    ...startDate,
    hour: 0,
    minute: 0,
    second: 0,
  }, timeZone);
  const endMs = localDateTimeToUtc({
    ...endDate,
    hour: 0,
    minute: 0,
    second: 0,
  }, timeZone);

  return {
    startMs,
    endMs,
    startAt: new Date(startMs).toISOString(),
    endAtExclusive: new Date(endMs).toISOString(),
  };
};

const getResponseTimeMs = (payload: AnalyticsEventDoc['payload']): number | null => {
  const value = payload?.responseTimeMs;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
};

export const createResponseTimeStats = (): number[] => [];

export const updateResponseTimeStats = (responseTimes: number[], event: AnalyticsEventDoc): void => {
  const responseTimeMs = getResponseTimeMs(event.payload);
  if (event.eventType === 'ai_response_sent' && responseTimeMs !== null) {
    responseTimes.push(responseTimeMs);
  }
};

export const getAverageResponseTimeMs = (responseTimes: number[]): number =>
  responseTimes.length === 0
    ? 0
    : Math.round(
      responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length,
    );
