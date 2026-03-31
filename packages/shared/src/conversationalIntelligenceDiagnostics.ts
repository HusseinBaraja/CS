export type ConversationalLanguage = "ar" | "en";

export type EvaluationMessageKind =
  | "text"
  | "image"
  | "video"
  | "document"
  | "audio"
  | "sticker";

export interface ConversationEvaluationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ConversationEvaluationInboundMessage {
  kind: EvaluationMessageKind;
  text: string;
  hasMedia: boolean;
  idleGapMsBefore?: number;
  referencedMessageId?: string;
}

export type PromptHistorySelectionMode =
  | "no_history"
  | "recent_window"
  | "stale_reset_empty"
  | "quoted_reference_window";

export type ContextUsageStage = "prompt_assembly";

export type RetrievalMode = "raw_latest_message";

export type RetrievalOutcome = "grounded" | "empty" | "low_signal";

export type FallbackDecisionType =
  | "clarify"
  | "no_match_reply"
  | "low_signal_reply"
  | "handoff";

export type FallbackReason =
  | "empty_query"
  | "no_hits"
  | "below_min_score"
  | "provider_failure"
  | "invalid_json"
  | "invalid_payload_shape"
  | "invalid_schema_version"
  | "invalid_text"
  | "invalid_action"
  | "assistant_action";

export type ProviderOutcome =
  | "not_requested"
  | "response_received"
  | "provider_failure"
  | "invalid_model_output";

export interface EvaluationResolvedIntentExpectation {
  standaloneQuery: string;
  requiresContextResolution: boolean;
}

export interface EvaluationRetrievalBehaviorExpectation {
  retrievalMode: RetrievalMode;
  outcome: RetrievalOutcome;
  shouldUseRecentTurns: boolean;
  shouldUseQuotedReference: boolean;
}

export interface EvaluationAssistantBehaviorExpectation {
  decisionType?: FallbackDecisionType;
  shouldHandoff: boolean;
  shouldClarify: boolean;
}

export interface EvaluationExpectationPair<T> {
  current: T;
  future: T;
}

export interface ConversationEvaluationCase {
  id: string;
  title: string;
  language: ConversationalLanguage;
  conversationHistory: ConversationEvaluationTurn[];
  inboundMessage: ConversationEvaluationInboundMessage;
  expectedResolvedIntent: EvaluationExpectationPair<EvaluationResolvedIntentExpectation>;
  expectedRetrievalBehavior: EvaluationExpectationPair<EvaluationRetrievalBehaviorExpectation>;
  expectedAssistantBehavior: EvaluationExpectationPair<EvaluationAssistantBehaviorExpectation>;
  tags: string[];
}

export interface ContextUsageEvent {
  conversationId: string;
  requestId: string;
  usedRecentTurns: boolean;
  usedConversationState: boolean;
  usedSummary: boolean;
  usedQuotedReference: boolean;
  usedGroundingFacts: boolean;
  stage: ContextUsageStage;
  promptHistorySelectionMode: PromptHistorySelectionMode;
}

export interface RetrievalOutcomeEvent {
  conversationId: string;
  requestId: string;
  queryText: string;
  retrievalMode: RetrievalMode;
  outcome: RetrievalOutcome;
  candidateCount: number;
  topScore: number | null;
  contextBlockCount: number;
  fallbackChosen: FallbackDecisionType | null;
}

export interface FallbackDecisionEvent {
  conversationId: string;
  requestId: string;
  decisionType: FallbackDecisionType;
  reason: FallbackReason;
  precedingStage: "retrieval" | "assistant";
  resolutionConfidence: number | null;
  retrievalOutcome: RetrievalOutcome | null;
  providerOutcome: ProviderOutcome;
}

export interface StructuredOutputFailureEvent {
  conversationId: string;
  requestId: string;
  provider: string;
  model: string | null;
  failureKind: Exclude<
    FallbackReason,
    "empty_query" | "no_hits" | "below_min_score" | "provider_failure" | "assistant_action"
  >;
  repairAttempted: boolean;
  fallbackChosen: FallbackDecisionType;
}
