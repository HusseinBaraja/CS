import { describe, expect, test } from "bun:test";
import {
  toContextUsageLogPayload,
  toFallbackDecisionLogPayload,
  toRetrievalOutcomeLogPayload,
  toStructuredOutputFailureLogPayload,
} from "./conversationalIntelligence";

describe("conversational intelligence log payload helpers", () => {
  test("summarizes retrieval query text instead of logging the raw query", () => {
    const payload = toRetrievalOutcomeLogPayload({
      conversationId: "conversation-1",
      requestId: "request-1",
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
    expect(Object.values(payload)).not.toContain("what sizes does it come in");
  });

  test("builds context usage payloads with provenance fields", () => {
    const payload = toContextUsageLogPayload({
      conversationId: "conversation-1",
      requestId: "request-1",
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
  });

  test("builds decision and structured output failure payloads", () => {
    const decisionPayload = toFallbackDecisionLogPayload({
      conversationId: "conversation-1",
      requestId: "request-1",
      decisionType: "handoff",
      reason: "provider_failure",
      precedingStage: "assistant",
      resolutionConfidence: null,
      retrievalOutcome: "grounded",
      providerOutcome: "provider_failure",
    });
    const failurePayload = toStructuredOutputFailureLogPayload({
      conversationId: "conversation-1",
      requestId: "request-1",
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
  });
});
