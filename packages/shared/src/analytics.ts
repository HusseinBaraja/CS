export const ANALYTICS_PERIODS = ["today", "week", "month"] as const;

export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const getAnalyticsIdempotencyKey = (pendingMessageId: string): string =>
  `pendingMessage:${pendingMessageId}:handoff_started`;

export const ANALYTICS_EVENT_TYPES = [
  "customer_message_received",
  "assistant_message_sent",
  "product_search",
  "clarification_requested",
  "catalog_sent",
  "image_sent",
  "handoff_started",
  "ai_response_sent",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const ANALYTICS_MESSAGE_EVENT_TYPES = [
  "customer_message_received",
  "assistant_message_sent",
] as const;

export const ANALYTICS_PRODUCT_LINKED_EVENT_TYPES = [
  "product_search",
  "clarification_requested",
  "catalog_sent",
  "image_sent",
  "ai_response_sent",
] as const;

export const ANALYTICS_COUNTED_EVENT_TYPES = [
  "customer_message_received",
  "assistant_message_sent",
  "product_search",
  "clarification_requested",
  "catalog_sent",
  "image_sent",
  "handoff_started",
  "ai_response_sent",
] as const;

export interface AnalyticsSummaryCounts {
  customerMessages: number;
  assistantMessages: number;
  totalMessages: number;
  productSearches: number;
  clarifications: number;
  catalogSends: number;
  imageSends: number;
  handoffs: number;
  successfulResponses: number;
}

export type AnalyticsHandoffSource =
  | "assistant_action"
  | "provider_failure_fallback"
  | "invalid_model_output_fallback"
  | "message_too_long"
  | "unknown";

export const ANALYTICS_HANDOFF_SOURCES = [
  "assistant_action",
  "provider_failure_fallback",
  "invalid_model_output_fallback",
  "message_too_long",
  "unknown",
] as const satisfies readonly AnalyticsHandoffSource[];

export const isValidHandoffSource = (value: string): value is AnalyticsHandoffSource =>
  ANALYTICS_HANDOFF_SOURCES.includes(value as AnalyticsHandoffSource);

export type AnalyticsHandoffSourceBreakdown = Record<AnalyticsHandoffSource, number>;

export interface AnalyticsTopProductDto {
  productId: string;
  nameEn?: string;
  nameAr?: string;
  interactionCount: number;
}

export interface AnalyticsSummaryDto {
  companyId: string;
  period: AnalyticsPeriod;
  timezone: string;
  window: {
    startAt: string;
    endAtExclusive: string;
  };
  counts: AnalyticsSummaryCounts;
  handoffsBySource: AnalyticsHandoffSourceBreakdown;
  performance: {
    averageResponseTimeMs: number;
  };
  topProducts: AnalyticsTopProductDto[];
}
