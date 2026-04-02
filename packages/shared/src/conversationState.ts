import type { PromptHistorySelectionMode, RetrievalOutcome } from "./conversationalIntelligenceDiagnostics";

export const CANONICAL_CONVERSATION_SOURCE_VALUES = [
  "system_seed",
  "system_passthrough",
  "assistant_action",
  "retrieval_single_candidate",
  "quoted_reference",
  "heuristic",
] as const;

export type CanonicalConversationSource = (typeof CANONICAL_CONVERSATION_SOURCE_VALUES)[number];

export const CANONICAL_CONVERSATION_FOCUS_KINDS = [
  "none",
  "category",
  "product",
  "variant",
  "catalog_slice",
] as const;

export type CanonicalConversationFocusKind = (typeof CANONICAL_CONVERSATION_FOCUS_KINDS)[number];

export const CANONICAL_CONVERSATION_PRESENTABLE_KINDS = [
  "category",
  "product",
  "variant",
  "catalog_slice",
] as const;

export type CanonicalConversationPresentableKind =
  (typeof CANONICAL_CONVERSATION_PRESENTABLE_KINDS)[number];

export const CANONICAL_CONVERSATION_FRESHNESS_STATUSES = [
  "fresh",
  "stale",
] as const;

export type CanonicalConversationFreshnessStatus = (typeof CANONICAL_CONVERSATION_FRESHNESS_STATUSES)[number];

export const CANONICAL_CONVERSATION_QUERY_STATUSES = [
  "unresolved_passthrough",
] as const;

export type CanonicalConversationQueryStatus = (typeof CANONICAL_CONVERSATION_QUERY_STATUSES)[number];

export interface CanonicalConversationFocusDto {
  kind: CanonicalConversationFocusKind;
  entityIds: string[];
  source?: CanonicalConversationSource;
  updatedAt?: number;
}

export interface CanonicalConversationPresentedListItemDto {
  displayIndex: number;
  entityKind: CanonicalConversationPresentableKind;
  entityId: string;
  score?: number;
}

export interface CanonicalConversationPresentedListDto {
  kind: CanonicalConversationPresentableKind;
  items: CanonicalConversationPresentedListItemDto[];
  source?: CanonicalConversationSource;
  updatedAt?: number;
}

export interface CanonicalConversationPendingClarificationDto {
  active: boolean;
  source?: CanonicalConversationSource;
  updatedAt?: number;
}

export interface CanonicalConversationLatestQueryDto {
  text: string;
  status: CanonicalConversationQueryStatus;
  source: CanonicalConversationSource;
  updatedAt: number;
}

export interface CanonicalConversationFreshnessDto {
  status: CanonicalConversationFreshnessStatus;
  updatedAt?: number;
  activeWindowExpiresAt?: number;
}

export interface CanonicalConversationSourceOfTruthMarkersDto {
  responseLanguage?: CanonicalConversationSource;
  currentFocus?: CanonicalConversationSource;
  lastPresentedList?: CanonicalConversationSource;
  pendingClarification?: CanonicalConversationSource;
  latestStandaloneQuery?: CanonicalConversationSource;
}

export interface CanonicalConversationHeuristicCandidateDto {
  entityKind: Exclude<CanonicalConversationFocusKind, "none" | "catalog_slice">;
  entityId: string;
  score: number;
}

export interface CanonicalConversationHeuristicHintsDto {
  promptHistorySelectionMode?: PromptHistorySelectionMode;
  usedQuotedReference: boolean;
  referencedTransportMessageId?: string;
  retrievalOutcome?: RetrievalOutcome;
  topCandidates: CanonicalConversationHeuristicCandidateDto[];
  retrievalOrderListProxy?: CanonicalConversationPresentedListDto;
  heuristicFocus?: CanonicalConversationFocusDto;
}

export interface CanonicalConversationStateDto {
  schemaVersion: "v1";
  conversationId: string;
  companyId: string;
  responseLanguage?: "ar" | "en";
  currentFocus: CanonicalConversationFocusDto;
  lastPresentedList?: CanonicalConversationPresentedListDto;
  pendingClarification: CanonicalConversationPendingClarificationDto;
  latestStandaloneQuery?: CanonicalConversationLatestQueryDto;
  freshness: CanonicalConversationFreshnessDto;
  sourceOfTruthMarkers: CanonicalConversationSourceOfTruthMarkersDto;
  heuristicHints: CanonicalConversationHeuristicHintsDto;
}

export interface CanonicalConversationStateReadResultDto {
  state: CanonicalConversationStateDto;
  invalidatedPaths: string[];
}

export type ConversationSummaryFreshnessStatus = "fresh" | "stale";

export interface ConversationSummaryFreshnessDto {
  status: ConversationSummaryFreshnessStatus;
  updatedAt?: number;
}

export interface ConversationSummaryProvenanceDto {
  source: "shadow" | "system_seed" | "summary_job";
  generatedAt?: number;
}

export interface ConversationSummaryCoveredMessageRangeDto {
  fromMessageId?: string;
  toMessageId?: string;
  messageCount?: number;
}

export interface ConversationSummaryResolvedDecisionDto {
  summary: string;
  source?: string;
}

export interface ConversationSummaryDto {
  summaryId: string;
  conversationId: string;
  durableCustomerGoal?: string;
  stablePreferences: string[];
  importantResolvedDecisions: ConversationSummaryResolvedDecisionDto[];
  historicalContextNeededForFutureTurns: string[];
  freshness: ConversationSummaryFreshnessDto;
  provenance: ConversationSummaryProvenanceDto;
  coveredMessageRange: ConversationSummaryCoveredMessageRangeDto;
}
