import type {
  CanonicalConversationPresentedListDto,
  CanonicalConversationStateDto,
  ConversationSummaryDto,
} from "./conversationState";

export const RESOLVED_INTENT_VALUES = [
  "catalog_search",
  "entity_followup",
  "image_request",
  "clarification_answer",
  "ambiguous_unresolved",
  "non_catalog_or_unsupported",
] as const;

export type ResolvedIntent = (typeof RESOLVED_INTENT_VALUES)[number];

export const TURN_PREFERRED_RETRIEVAL_MODE_VALUES = [
  "semantic_catalog_search",
  "direct_entity_lookup",
  "variant_lookup",
  "filtered_catalog_search",
  "skip_retrieval",
  "clarification_required",
] as const;

export type TurnPreferredRetrievalMode = (typeof TURN_PREFERRED_RETRIEVAL_MODE_VALUES)[number];

export const TURN_QUERY_STATUS_VALUES = [
  "rewritten",
  "resolved_passthrough",
  "unresolved_passthrough",
  "not_applicable",
] as const;

export type TurnQueryStatus = (typeof TURN_QUERY_STATUS_VALUES)[number];

export const TURN_PASSTHROUGH_REASON_VALUES = [
  "already_standalone",
  "no_safe_rewrite_needed",
  "insufficient_context_for_rewrite",
  "entity_resolved_but_query_not_needed",
  "clarification_short_circuit",
] as const;

export type TurnPassthroughReason = (typeof TURN_PASSTHROUGH_REASON_VALUES)[number];

export const TURN_RESOLUTION_CONFIDENCE_VALUES = [
  "high",
  "medium",
  "low",
] as const;

export type TurnResolutionConfidence = (typeof TURN_RESOLUTION_CONFIDENCE_VALUES)[number];

export const TURN_SELECTED_RESOLUTION_SOURCE_VALUES = [
  "quoted_reference",
  "current_focus",
  "last_presented_list",
  "pending_clarification",
  "semantic_assistant_record",
  "recent_turns",
  "summary",
  "raw_text",
] as const;

export type TurnSelectedResolutionSource = (typeof TURN_SELECTED_RESOLUTION_SOURCE_VALUES)[number];

export const TURN_CLARIFICATION_REASON_VALUES = [
  "ambiguous_referent",
  "multiple_candidate_lists",
  "stale_context_without_anchor",
  "unsupported_request",
  "low_confidence_resolution",
  "missing_required_entity",
  "referenced_entity_invalid",
] as const;

export type TurnClarificationReason = (typeof TURN_CLARIFICATION_REASON_VALUES)[number];

export const TURN_CLARIFICATION_TARGET_VALUES = [
  "referent",
  "entity",
  "list_selection",
  "request_scope",
  "user_restatement",
] as const;

export type TurnClarificationTarget = (typeof TURN_CLARIFICATION_TARGET_VALUES)[number];

export const TURN_CLARIFICATION_PROMPT_STRATEGY_VALUES = [
  "ask_for_name",
  "ask_for_index",
  "ask_to_restate",
  "explain_unsupported_scope",
] as const;

export type TurnClarificationPromptStrategy = (typeof TURN_CLARIFICATION_PROMPT_STRATEGY_VALUES)[number];

export const TURN_REFERENCED_ENTITY_SOURCE_VALUES = [
  "quoted_reference",
  "current_focus",
  "last_presented_list",
  "pending_clarification",
  "semantic_assistant_record",
  "recent_turns",
  "summary",
  "raw_text",
  "heuristic_hint",
] as const;

export type TurnReferencedEntitySource = (typeof TURN_REFERENCED_ENTITY_SOURCE_VALUES)[number];

export const TURN_PROVENANCE_EVIDENCE_KIND_VALUES = [
  "transport_message_id",
  "conversation_message_id",
  "assistant_semantic_record_id",
  "canonical_state_path",
  "summary_id",
  "quoted_reference_transport_message_id",
] as const;

export type TurnProvenanceEvidenceKind = (typeof TURN_PROVENANCE_EVIDENCE_KIND_VALUES)[number];

export interface TurnResolutionRecentTurn {
  role: "user" | "assistant";
  text: string;
}

export interface TurnResolutionPolicy {
  allowModelAssistedFallback: boolean;
  allowSemanticAssistantFallback: boolean;
  allowSummarySupport: boolean;
  staleContextWindowMs: number;
  quotedReferenceOverridesStaleness: boolean;
  minimumConfidenceToProceed: Exclude<TurnResolutionConfidence, "low">;
  allowMediumConfidenceProceed: boolean;
  maxSemanticFallbackDepth?: number;
}

export interface TurnReferencedEntity {
  entityKind: "category" | "product" | "variant";
  entityId: string;
  source: TurnReferencedEntitySource;
  confidence?: TurnResolutionConfidence;
}

export interface TurnResolutionQuotedReference {
  transportMessageId?: string;
  conversationMessageId?: string;
  role: "user" | "assistant";
  text: string;
  presentedList?: CanonicalConversationPresentedListDto;
  referencedEntities?: TurnReferencedEntity[];
}

export interface TurnResolutionPresentedListTarget {
  sourceListId: string;
  listKind: "category" | "product" | "variant" | "catalog_slice";
  targetedDisplayIndexes: number[];
}

export interface TurnResolutionClarificationCandidateOption {
  entityKind: "category" | "product" | "variant";
  entityId: string;
  label: string;
}

export interface TurnResolutionClarification {
  reason: TurnClarificationReason;
  target: TurnClarificationTarget;
  suggestedPromptStrategy: TurnClarificationPromptStrategy;
  candidateOptions?: TurnResolutionClarificationCandidateOption[];
}

export interface TurnResolutionProvenanceEvidence {
  kind: TurnProvenanceEvidenceKind;
  value: string;
}

export interface TurnResolutionProvenanceSource {
  source: TurnSelectedResolutionSource;
  evidence: TurnResolutionProvenanceEvidence[];
}

export interface TurnResolutionProvenance {
  selectedSources: TurnResolutionProvenanceSource[];
  supportingSources: TurnResolutionProvenanceSource[];
  conflictingSources: TurnResolutionProvenanceSource[];
  discardedSources: TurnResolutionProvenanceSource[];
}

export interface AssistantSemanticRecordForResolution {
  semanticRecordId: string;
  assistantMessageId: string;
  actionType: "none" | "clarify" | "handoff";
  responseLanguage?: "ar" | "en";
  responseMode: "grounded" | "inferred" | "clarified" | "fallback" | "handoff";
  orderedPresentedEntityIds: string[];
  presentedList?: CanonicalConversationPresentedListDto;
  referencedEntities: TurnReferencedEntity[];
  resolvedStandaloneQueryUsed?: {
    text: string;
    status: "used" | "not_used";
  };
  createdAt: number;
}

export interface TurnResolutionInput {
  rawInboundText: string;
  recentTurns: TurnResolutionRecentTurn[];
  canonicalState: CanonicalConversationStateDto | null;
  conversationSummary: ConversationSummaryDto | null;
  resolutionPolicy: TurnResolutionPolicy;
  languageHint?: "ar" | "en";
  quotedReference?: TurnResolutionQuotedReference;
  semanticAssistantRecords?: AssistantSemanticRecordForResolution[];
}

export interface ResolvedUserTurn {
  rawInboundText: string;
  normalizedInboundText: string;
  resolvedIntent: ResolvedIntent;
  preferredRetrievalMode: TurnPreferredRetrievalMode;
  queryStatus: TurnQueryStatus;
  standaloneQuery: string | null;
  passthroughReason?: TurnPassthroughReason;
  presentedListTarget: TurnResolutionPresentedListTarget | null;
  referencedEntities: TurnReferencedEntity[];
  primaryEntityId: string | null;
  resolutionConfidence: TurnResolutionConfidence;
  clarificationRequired: boolean;
  clarification: TurnResolutionClarification | null;
  selectedResolutionSource: TurnSelectedResolutionSource;
  provenance: TurnResolutionProvenance;
  language: "ar" | "en";
  shadowModelAssistedResult?: {
    agreedWithDeterministic: boolean;
    preferredRetrievalMode: TurnPreferredRetrievalMode;
    resolutionConfidence: TurnResolutionConfidence;
  };
}
