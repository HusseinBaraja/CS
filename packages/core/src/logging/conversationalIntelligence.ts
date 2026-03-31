import type {
  ContextUsageEvent,
  FallbackDecisionEvent,
  RetrievalOutcomeEvent,
  StructuredOutputFailureEvent,
} from "@cs/shared";
import type { StructuredLogPayloadInput } from "./types";
import { summarizeTextForLog } from "./helpers";

export const toContextUsageLogPayload = (
  event: ContextUsageEvent,
): StructuredLogPayloadInput => ({
  event: "rag.context_usage.recorded",
  runtime: "rag",
  surface: "orchestrator",
  outcome: "recorded",
  ...(event.conversationId ? { conversationId: event.conversationId } : {}),
  ...(event.requestId ? { requestId: event.requestId } : {}),
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
  ...(event.conversationId ? { conversationId: event.conversationId } : {}),
  ...(event.requestId ? { requestId: event.requestId } : {}),
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
  ...(event.conversationId ? { conversationId: event.conversationId } : {}),
  ...(event.requestId ? { requestId: event.requestId } : {}),
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
  ...(event.conversationId ? { conversationId: event.conversationId } : {}),
  ...(event.requestId ? { requestId: event.requestId } : {}),
  provider: event.provider,
  model: event.model,
  failureKind: event.failureKind,
  repairAttempted: event.repairAttempted,
  fallbackChosen: event.fallbackChosen,
});
