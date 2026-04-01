import { describe, expect, test } from "bun:test";
import {
  toCanonicalConversationStateFallbackMismatchLogPayload,
  toCanonicalConversationStateInvalidationLogPayload,
  toCanonicalConversationStateLoadLogPayload,
  toCanonicalConversationStateWriteLogPayload,
  toContextUsageLogPayload,
  toFallbackDecisionLogPayload,
  toRetrievalOutcomeLogPayload,
  toStructuredOutputFailureLogPayload,
} from "./conversationalIntelligence";

describe("conversational intelligence log payload helpers", () => {
  test("summarizes retrieval query text instead of logging the raw query", () => {
    const payload = toRetrievalOutcomeLogPayload({
      queryText: "what sizes does it come in",
      retrievalMode: "raw_latest_message",
      outcome: "low_signal",
      candidateCount: 2,
      topScore: 0.42,
      contextBlockCount: 0,
      fallbackChosen: "low_signal_reply",
    });

    expect(payload).toMatchObject({
      event: "rag.retrieval.outcome_recorded",
      runtime: "rag",
      surface: "retrieval",
      outcome: "recorded",
      retrievalMode: "raw_latest_message",
      retrievalOutcome: "low_signal",
      candidateCount: 2,
      topScore: 0.42,
      contextBlockCount: 0,
      fallbackChosen: "low_signal_reply",
      textLength: "what sizes does it come in".length,
      textLineCount: 1,
    });
    expect(payload).not.toHaveProperty("queryText");
    expect(payload).not.toHaveProperty("conversationId");
    expect(payload).not.toHaveProperty("requestId");
    expect(Object.values(payload)).not.toContain("what sizes does it come in");
  });

  test("builds context usage payloads with provenance fields", () => {
    const payload = toContextUsageLogPayload({
      usedRecentTurns: true,
      usedConversationState: false,
      usedSummary: false,
      usedQuotedReference: true,
      usedGroundingFacts: true,
      stage: "prompt_assembly",
      promptHistorySelectionMode: "quoted_reference_window",
    });

    expect(payload).toMatchObject({
      event: "rag.context_usage.recorded",
      promptHistorySelectionMode: "quoted_reference_window",
      usedQuotedReference: true,
      usedGroundingFacts: true,
    });
    expect(payload).not.toHaveProperty("conversationId");
    expect(payload).not.toHaveProperty("requestId");
  });

  test("builds decision and structured output failure payloads", () => {
    const decisionPayload = toFallbackDecisionLogPayload({
      decisionType: "handoff",
      reason: "provider_failure",
      precedingStage: "assistant",
      resolutionConfidence: null,
      retrievalOutcome: "grounded",
      providerOutcome: "provider_failure",
    });
    const failurePayload = toStructuredOutputFailureLogPayload({
      provider: "gemini",
      model: "gemini-2.0-flash",
      failureKind: "invalid_json",
      repairAttempted: false,
      fallbackChosen: "handoff",
    });

    expect(decisionPayload).toMatchObject({
      event: "rag.decision.recorded",
      decisionType: "handoff",
      reason: "provider_failure",
    });
    expect(failurePayload).toMatchObject({
      event: "rag.structured_output.failure_recorded",
      provider: "gemini",
      failureKind: "invalid_json",
      fallbackChosen: "handoff",
    });
    expect(decisionPayload).not.toHaveProperty("conversationId");
    expect(decisionPayload).not.toHaveProperty("requestId");
    expect(failurePayload).not.toHaveProperty("conversationId");
    expect(failurePayload).not.toHaveProperty("requestId");
  });

  test("builds canonical conversation state diagnostics payloads", () => {
    const loadPayload = toCanonicalConversationStateLoadLogPayload(
      {
        conversationId: "conversation-1",
        requestId: "request-1",
        invalidatedPaths: ["currentFocus"],
        freshnessStatus: "fresh",
        authoritativeFocusKind: "product",
        authoritativeFocusEntityCount: 1,
        heuristicCandidateCount: 2,
      },
      {
        runtime: "bot",
        surface: "router",
        outcome: "loaded",
      },
    );
    const writePayload = toCanonicalConversationStateWriteLogPayload(
      {
        conversationId: "conversation-1",
        authoritativeFocusKind: "product",
        authoritativeFocusEntityCount: 1,
        authoritativeFocusSource: "retrieval_single_candidate",
        pendingClarificationActive: false,
        heuristicCandidateCount: 1,
        latestStandaloneQueryStatus: "unresolved_passthrough",
        responseLanguage: "en",
      },
      {
        runtime: "bot",
        surface: "router",
        outcome: "written",
      },
    );
    const invalidationPayload = toCanonicalConversationStateInvalidationLogPayload(
      {
        conversationId: "conversation-1",
        requestId: "request-1",
        invalidatedPaths: ["currentFocus", "heuristicHints.heuristicFocus"],
      },
      {
        runtime: "bot",
        surface: "router",
        outcome: "recorded",
      },
    );
    const fallbackMismatchPayload = toCanonicalConversationStateFallbackMismatchLogPayload(
      {
        conversationId: "conversation-1",
        requestId: "request-1",
        retrievalOutcome: "low_signal",
        freshnessStatus: "fresh",
        promptHistorySelectionMode: "quoted_reference_window",
        authoritativeFocusKind: "product",
        authoritativeFocusSource: "retrieval_single_candidate",
        heuristicCandidateCount: 2,
      },
      {
        runtime: "rag",
        surface: "orchestrator",
        outcome: "recorded",
      },
    );

    expect(loadPayload).toMatchObject({
      event: "conversation.canonical_state.load_recorded",
      runtime: "bot",
      surface: "router",
      outcome: "loaded",
      conversationId: "conversation-1",
      requestId: "request-1",
      invalidatedPathCount: 1,
      freshnessStatus: "fresh",
      authoritativeFocusKind: "product",
      authoritativeFocusEntityCount: 1,
      heuristicCandidateCount: 2,
    });
    expect(writePayload).toMatchObject({
      event: "conversation.canonical_state.write_recorded",
      runtime: "bot",
      surface: "router",
      outcome: "written",
      conversationId: "conversation-1",
      authoritativeFocusKind: "product",
      authoritativeFocusEntityCount: 1,
      authoritativeFocusSource: "retrieval_single_candidate",
      pendingClarificationActive: false,
      heuristicCandidateCount: 1,
      latestStandaloneQueryStatus: "unresolved_passthrough",
      responseLanguage: "en",
    });
    expect(invalidationPayload).toMatchObject({
      event: "conversation.canonical_state.invalidation_recorded",
      runtime: "bot",
      surface: "router",
      outcome: "recorded",
      conversationId: "conversation-1",
      requestId: "request-1",
      invalidatedPathCount: 2,
      invalidatedPaths: ["currentFocus", "heuristicHints.heuristicFocus"],
    });
    expect(fallbackMismatchPayload).toMatchObject({
      event: "conversation.canonical_state.fallback_mismatch_recorded",
      runtime: "rag",
      surface: "orchestrator",
      outcome: "recorded",
      conversationId: "conversation-1",
      requestId: "request-1",
      retrievalOutcome: "low_signal",
      freshnessStatus: "fresh",
      promptHistorySelectionMode: "quoted_reference_window",
      authoritativeFocusKind: "product",
      authoritativeFocusSource: "retrieval_single_candidate",
      heuristicCandidateCount: 2,
    });
  });
});
