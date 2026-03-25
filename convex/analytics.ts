import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type QueryCtx } from './_generated/server';
import {
  ANALYTICS_COUNTED_EVENT_TYPES,
  ANALYTICS_PRODUCT_LINKED_EVENT_TYPES,
  type AnalyticsEventType,
  type AnalyticsPeriod,
  type AnalyticsSummaryCounts,
  type AnalyticsSummaryDto,
  type AnalyticsTopProductDto,
} from '@cs/shared';

const DEFAULT_TIMEZONE = "UTC";
const TIMEZONE_QUERY_BUFFER_MS = 14 * 60 * 60 * 1000;

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type LocalDate = Pick<LocalDateTime, "year" | "month" | "day">;

type AnalyticsEventDoc = Doc<"analyticsEvents">;

type AnalyticsWindow = {
  startMs: number;
  endMs: number;
  startAt: string;
  endAtExclusive: string;
};

const localDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

const countedEventTypes = [...ANALYTICS_COUNTED_EVENT_TYPES];
const productLinkedEventTypes = new Set<string>(ANALYTICS_PRODUCT_LINKED_EVENT_TYPES);

const createEmptyCounts = (): AnalyticsSummaryCounts => ({
  customerMessages: 0,
  assistantMessages: 0,
  totalMessages: 0,
  productSearches: 0,
  clarifications: 0,
  catalogSends: 0,
  imageSends: 0,
  handoffs: 0,
  successfulResponses: 0,
});

const createEmptySummary = (
  companyId: string,
  period: AnalyticsPeriod,
  timezone: string,
  window: AnalyticsWindow,
): AnalyticsSummaryDto => ({
  companyId,
  period,
  timezone,
  window: {
    startAt: window.startAt,
    endAtExclusive: window.endAtExclusive,
  },
  counts: createEmptyCounts(),
  performance: {
    averageResponseTimeMs: 0,
  },
  topProducts: [],
});

const getLocalDateTimeFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = localDateTimeFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
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
    year: readPart("year"),
    month: readPart("month"),
    day: readPart("day"),
    hour: readPart("hour"),
    minute: readPart("minute"),
    second: readPart("second"),
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

const getWindow = (timeZone: string, period: AnalyticsPeriod, now: number): AnalyticsWindow => {
  const nowLocal = getLocalDateTime(now, timeZone);
  const today: LocalDate = {
    year: nowLocal.year,
    month: nowLocal.month,
    day: nowLocal.day,
  };

  let startDate = today;
  let endDate = addDays(today, 1);

  if (period === "week") {
    startDate = getStartOfWeek(today);
    endDate = addDays(startDate, 7);
  } else if (period === "month") {
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

const getProductIdFromPayload = (payload: AnalyticsEventDoc["payload"]): string | null => {
  const value = payload?.productId;
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const getResponseTimeMs = (payload: AnalyticsEventDoc["payload"]): number | null => {
  const value = payload?.responseTimeMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
};

const getCandidateEventsForType = async (
  ctx: QueryCtx,
  companyId: Id<"companies">,
  eventType: AnalyticsEventType,
  startMs: number,
  endMs: number,
): Promise<AnalyticsEventDoc[]> =>
  ctx.db
    .query("analyticsEvents")
    .withIndex("by_company_type_time", (q) =>
      q
        .eq("companyId", companyId)
        .eq("eventType", eventType)
        .gte("timestamp", Math.max(0, startMs - TIMEZONE_QUERY_BUFFER_MS))
        .lt("timestamp", endMs + TIMEZONE_QUERY_BUFFER_MS),
    )
    .collect();

export const summary = internalQuery({
  args: {
    companyId: v.id("companies"),
    period: v.optional(v.union(v.literal("today"), v.literal("week"), v.literal("month"))),
  },
  handler: async (ctx, args): Promise<AnalyticsSummaryDto | null> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return null;
    }

    const period = args.period ?? "today";
    const timezone = company.timezone ?? DEFAULT_TIMEZONE;
    const window = getWindow(timezone, period, Date.now());
    const zeroSummary = createEmptySummary(args.companyId, period, timezone, window);

    const candidateResults = await Promise.all(
      countedEventTypes.map((eventType) =>
        getCandidateEventsForType(ctx, args.companyId, eventType, window.startMs, window.endMs),
      ),
    );

    const events = candidateResults
      .flat()
      .filter((event) => event.timestamp >= window.startMs && event.timestamp < window.endMs);

    if (events.length === 0) {
      return zeroSummary;
    }

    const counts = createEmptyCounts();
    const responseTimes: number[] = [];
    const productInteractionStats = new Map<string, { interactionCount: number; latestTimestamp: number }>();

    for (const event of events) {
      switch (event.eventType) {
        case "customer_message_received":
          counts.customerMessages += 1;
          break;
        case "assistant_message_sent":
          counts.assistantMessages += 1;
          break;
        case "product_search":
          counts.productSearches += 1;
          break;
        case "clarification_requested":
          counts.clarifications += 1;
          break;
        case "catalog_sent":
          counts.catalogSends += 1;
          break;
        case "image_sent":
          counts.imageSends += 1;
          break;
        case "handoff_started":
          counts.handoffs += 1;
          break;
        case "ai_response_sent":
          counts.successfulResponses += 1;
          break;
        default:
          break;
      }

      const responseTimeMs = getResponseTimeMs(event.payload);
      if (event.eventType === "ai_response_sent" && responseTimeMs !== null) {
        responseTimes.push(responseTimeMs);
      }

      if (!productLinkedEventTypes.has(event.eventType)) {
        continue;
      }

      const productId = getProductIdFromPayload(event.payload);
      if (!productId) {
        continue;
      }

      const currentStats = productInteractionStats.get(productId);
      if (currentStats) {
        currentStats.interactionCount += 1;
        currentStats.latestTimestamp = Math.max(currentStats.latestTimestamp, event.timestamp);
      } else {
        productInteractionStats.set(productId, {
          interactionCount: 1,
          latestTimestamp: event.timestamp,
        });
      }
    }

    counts.totalMessages = counts.customerMessages + counts.assistantMessages;

    const interactedProductIds = new Set(Array.from(productInteractionStats.keys()));
    const productsById =
      interactedProductIds.size === 0
        ? new Map<string, Doc<"products">>()
        : new Map(
            (
              await ctx.db
                .query("products")
                .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
                .collect()
            )
              .filter((product) => interactedProductIds.has(product._id))
              .map((product) => [product._id, product] as const),
          );

    const productSummaries = Array.from(productInteractionStats.entries()).map(([productId, stats]) => {
      const product = productsById.get(productId);
      if (!product) {
        return null;
      }

      return {
        latestTimestamp: stats.latestTimestamp,
        topProduct: {
          productId,
          nameEn: product.nameEn,
          ...(product.nameAr ? { nameAr: product.nameAr } : {}),
          interactionCount: stats.interactionCount,
        } satisfies AnalyticsTopProductDto,
      };
    });

    const validTopProducts = productSummaries
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort(
        (left, right) =>
          right.topProduct.interactionCount - left.topProduct.interactionCount ||
          right.latestTimestamp - left.latestTimestamp ||
          left.topProduct.productId.localeCompare(right.topProduct.productId),
      )
      .slice(0, 5)
      .map((entry) => entry.topProduct);

    const averageResponseTimeMs =
      responseTimes.length === 0
        ? 0
        : Math.round(
          responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length,
        );

    return {
      ...zeroSummary,
      counts,
      performance: {
        averageResponseTimeMs,
      },
      topProducts: validTopProducts,
    };
  },
});

export const recordEvent = internalMutation({
  args: {
    companyId: v.id("companies"),
    // Keep these literals aligned with the shared analytics event contracts in @cs/shared.
    eventType: v.union(
      v.literal("customer_message_received"),
      v.literal("assistant_message_sent"),
      v.literal("product_search"),
      v.literal("clarification_requested"),
      v.literal("catalog_sent"),
      v.literal("image_sent"),
      v.literal("handoff_started"),
      v.literal("ai_response_sent"),
    ),
    timestamp: v.number(),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<void> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    await ctx.db.insert("analyticsEvents", {
      companyId: args.companyId,
      eventType: args.eventType,
      timestamp: args.timestamp,
      ...(args.payload ? { payload: args.payload } : {}),
    });
  },
});
