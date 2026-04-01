import type {
  CanonicalConversationStateFallbackMismatchEvent,
  CanonicalConversationStateInvalidationEvent,
  CanonicalConversationStateLoadEvent,
  CanonicalConversationStateWriteEvent,
  ContextUsageEvent,
  FallbackDecisionEvent,
  RetrievalOutcomeEvent,
  StructuredOutputFailureEvent,
} from "@cs/shared";
import type { StructuredLogPayloadInput } from "./types";
import { summarizeTextForLog } from "./helpers";

interface CanonicalConversationStateLogContext {
  runtime: string;
  surface: string;
  outcome: string;
}

const withConversationIdentifiers = (
  event: Pick<
    | CanonicalConversationStateLoadEvent
    | CanonicalConversationStateWriteEvent
    | CanonicalConversationStateInvalidationEvent
    | CanonicalConversationStateFallbackMismatchEvent
    | ContextUsageEvent
    | RetrievalOutcomeEvent
    | FallbackDecisionEvent
    | StructuredOutputFailureEvent,
    "conversationId" | "requestId"
  >,
) => ({
  ...(event.conversationId ? { conversationId: event.conversationId } : {}),
  ...(event.requestId ? { requestId: event.requestId } : {}),
});

export const toContextUsageLogPayload = (
  event: ContextUsageEvent,
): StructuredLogPayloadInput => ({
  event: "rag.context_usage.recorded",
  runtime: "rag",
  surface: "orchestrator",
  outcome: "recorded",
  ...withConversationIdentifiers(event),
  stage: event.stage,
  promptHistorySelectionMode: event.promptHistorySelectionMode,
  usedRecentTurns: event.usedRecentTurns,
  usedConversationState: event.usedConversationState,
  usedSummary: event.usedSummary,
  usedQuotedReference: event.usedQuotedReference,
  usedGroundingFacts: event.usedGroundingFacts,
});

export const toRetrievalOutcomeLogPayload = (
  event: RetrievalOutcomeEvent,
): StructuredLogPayloadInput => ({
  event: "rag.retrieval.outcome_recorded",
  runtime: "rag",
  surface: "retrieval",
  outcome: "recorded",
  ...withConversationIdentifiers(event),
  retrievalMode: event.retrievalMode,
  retrievalOutcome: event.outcome,
  candidateCount: event.candidateCount,
  topScore: event.topScore,
  contextBlockCount: event.contextBlockCount,
  fallbackChosen: event.fallbackChosen,
  ...summarizeTextForLog(event.queryText),
});

export const toFallbackDecisionLogPayload = (
  event: FallbackDecisionEvent,
): StructuredLogPayloadInput => ({
  event: "rag.decision.recorded",
  runtime: "rag",
  surface: "orchestrator",
  outcome: "recorded",
  ...withConversationIdentifiers(event),
  decisionType: event.decisionType,
  reason: event.reason,
  precedingStage: event.precedingStage,
  resolutionConfidence: event.resolutionConfidence,
  retrievalOutcome: event.retrievalOutcome,
  providerOutcome: event.providerOutcome,
});

export const toStructuredOutputFailureLogPayload = (
  event: StructuredOutputFailureEvent,
): StructuredLogPayloadInput => ({
  event: "rag.structured_output.failure_recorded",
  runtime: "rag",
  surface: "orchestrator",
  outcome: "recorded",
  ...withConversationIdentifiers(event),
  provider: event.provider,
  model: event.model,
  failureKind: event.failureKind,
  repairAttempted: event.repairAttempted,
  fallbackChosen: event.fallbackChosen,
});

export const toCanonicalConversationStateLoadLogPayload = (
  event: CanonicalConversationStateLoadEvent,
  context: CanonicalConversationStateLogContext,
): StructuredLogPayloadInput => ({
  event: "conversation.canonical_state.load_recorded",
  runtime: context.runtime,
  surface: context.surface,
  outcome: context.outcome,
  ...withConversationIdentifiers(event),
  invalidatedPathCount: event.invalidatedPaths.length,
  ...(event.freshnessStatus ? { freshnessStatus: event.freshnessStatus } : {}),
  ...(event.authoritativeFocusKind ? { authoritativeFocusKind: event.authoritativeFocusKind } : {}),
  authoritativeFocusEntityCount: event.authoritativeFocusEntityCount ?? 0,
  heuristicCandidateCount: event.heuristicCandidateCount,
});

export const toCanonicalConversationStateWriteLogPayload = (
  event: CanonicalConversationStateWriteEvent,
  context: CanonicalConversationStateLogContext,
): StructuredLogPayloadInput => ({
  event: "conversation.canonical_state.write_recorded",
  runtime: context.runtime,
  surface: context.surface,
  outcome: context.outcome,
  ...withConversationIdentifiers(event),
  authoritativeFocusKind: event.authoritativeFocusKind ?? "none",
  authoritativeFocusEntityCount: event.authoritativeFocusEntityCount ?? 0,
  ...(event.authoritativeFocusSource ? { authoritativeFocusSource: event.authoritativeFocusSource } : {}),
  ...(event.pendingClarificationActive !== undefined
    ? { pendingClarificationActive: event.pendingClarificationActive }
    : {}),
  heuristicCandidateCount: event.heuristicCandidateCount,
  ...(event.latestStandaloneQueryStatus ? { latestStandaloneQueryStatus: event.latestStandaloneQueryStatus } : {}),
  ...(event.responseLanguage ? { responseLanguage: event.responseLanguage } : {}),
});

export const toCanonicalConversationStateInvalidationLogPayload = (
  event: CanonicalConversationStateInvalidationEvent,
  context: CanonicalConversationStateLogContext,
): StructuredLogPayloadInput => ({
  event: "conversation.canonical_state.invalidation_recorded",
  runtime: context.runtime,
  surface: context.surface,
  outcome: context.outcome,
  ...withConversationIdentifiers(event),
  invalidatedPathCount: event.invalidatedPaths.length,
  invalidatedPaths: [...event.invalidatedPaths],
});

export const toCanonicalConversationStateFallbackMismatchLogPayload = (
  event: CanonicalConversationStateFallbackMismatchEvent,
  context: CanonicalConversationStateLogContext,
): StructuredLogPayloadInput => ({
  event: "conversation.canonical_state.fallback_mismatch_recorded",
  runtime: context.runtime,
  surface: context.surface,
  outcome: context.outcome,
  ...withConversationIdentifiers(event),
  retrievalOutcome: event.retrievalOutcome,
  ...(event.freshnessStatus ? { freshnessStatus: event.freshnessStatus } : {}),
  promptHistorySelectionMode: event.promptHistorySelectionMode,
  ...(event.authoritativeFocusKind ? { authoritativeFocusKind: event.authoritativeFocusKind } : {}),
  ...(event.authoritativeFocusSource ? { authoritativeFocusSource: event.authoritativeFocusSource } : {}),
  heuristicCandidateCount: event.heuristicCandidateCount,
});
