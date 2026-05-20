import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type QueryCtx } from './_generated/server';
import { createEmptyHandoffSourceBreakdown, incrementHandoffCounts } from './analytics/handoffAggregation';
import {
  createProductInteractionStats,
  finalizeProductStats,
  getInteractedProductIds,
  updateProductInteractions,
} from './analytics/productAggregation';
import { getProductsByInteractedId } from './analytics/productReaders';
import {
  createResponseTimeStats,
  getAverageResponseTimeMs,
  getWindow,
  TIMEZONE_QUERY_BUFFER_MS,
  updateResponseTimeStats,
  type AnalyticsWindow,
} from './analytics/windowing';
import {
  ANALYTICS_COUNTED_EVENT_TYPES,
  type AnalyticsEventType,
  type AnalyticsPeriod,
  type AnalyticsSummaryCounts,
  type AnalyticsSummaryDto,
} from '@cs/shared';

const DEFAULT_TIMEZONE = "UTC";

type AnalyticsEventDoc = Doc<"analyticsEvents">;

const countedEventTypes = [...ANALYTICS_COUNTED_EVENT_TYPES];

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
  handoffsBySource: createEmptyHandoffSourceBreakdown(),
  performance: {
    averageResponseTimeMs: 0,
  },
  topProducts: [],
});

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

const normalizeOptionalIdempotencyKey = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("idempotencyKey must be a non-empty string when provided");
  }

  return normalized;
};

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
    const handoffsBySource = createEmptyHandoffSourceBreakdown();
    const responseTimes = createResponseTimeStats();
    const productInteractionStats = createProductInteractionStats();

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
          incrementHandoffCounts(handoffsBySource, event.payload);
          break;
        case "ai_response_sent":
          counts.successfulResponses += 1;
          break;
        default:
          break;
      }

      updateResponseTimeStats(responseTimes, event);
      updateProductInteractions(productInteractionStats, event);
    }

    counts.totalMessages = counts.customerMessages + counts.assistantMessages;

    const interactedProductIds = getInteractedProductIds(productInteractionStats);
    const productsById = await getProductsByInteractedId(ctx, args.companyId, interactedProductIds);

    const validTopProducts = finalizeProductStats(productInteractionStats, productsById);
    const averageResponseTimeMs = getAverageResponseTimeMs(responseTimes);

    return {
      ...zeroSummary,
      counts,
      handoffsBySource,
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
    idempotencyKey: v.optional(v.string()),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<void> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const idempotencyKey = normalizeOptionalIdempotencyKey(args.idempotencyKey);
    if (idempotencyKey) {
      const existing = await ctx.db
        .query("analyticsEvents")
        .withIndex("by_company_type_idempotency_key", (q) =>
          q
            .eq("companyId", args.companyId)
            .eq("eventType", args.eventType)
            .eq("idempotencyKey", idempotencyKey)
        )
        .collect();
      if (existing[0]) {
        return;
      }
    }

    await ctx.db.insert("analyticsEvents", {
      companyId: args.companyId,
      eventType: args.eventType,
      timestamp: args.timestamp,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(args.payload ? { payload: args.payload } : {}),
    });
  },
});
