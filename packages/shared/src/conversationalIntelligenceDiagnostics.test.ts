import { describe, expect, test } from "bun:test";
import type {
  CanonicalConversationStateFallbackMismatchEvent,
  CanonicalConversationStateLoadEvent,
  CanonicalConversationStateWriteEvent,
  ConversationEvaluationCase,
  ContextUsageEvent,
  ResolutionClarificationShortCircuitEvent,
  ResolutionPassthroughEvent,
  ResolutionShadowDisagreementEvent,
  ResolutionSourceSelectionEvent,
} from "./conversationalIntelligenceDiagnostics";

describe("conversational intelligence diagnostics contracts", () => {
  test("supports regression cases with current and future expectations", () => {
    const evaluationCase: ConversationEvaluationCase = {
      id: "pronoun_followup_en",
      title: "Pronoun follow-up in English",
      language: "en",
      conversationHistory: [
        { role: "user", text: "Tell me about the burger box." },
        { role: "assistant", text: "We have a burger box in three sizes." },
      ],
      inboundMessage: {
        kind: "text",
        text: "what sizes does it come in",
        hasMedia: false,
      },
      expectedResolvedIntent: {
        current: {
          standaloneQuery: "what sizes does it come in",
          requiresContextResolution: false,
        },
        future: {
          standaloneQuery: "What sizes does the burger box come in?",
          requiresContextResolution: true,
        },
      },
      expectedRetrievalBehavior: {
        current: {
          retrievalMode: "raw_latest_message",
          outcome: "low_signal",
          shouldUseRecentTurns: true,
          shouldUseQuotedReference: false,
        },
        future: {
          retrievalMode: "raw_latest_message",
          outcome: "grounded",
          shouldUseRecentTurns: true,
          shouldUseQuotedReference: false,
        },
      },
      expectedAssistantBehavior: {
        current: {
          decisionType: "low_signal_reply",
          shouldClarify: false,
          shouldHandoff: false,
        },
        future: {
          shouldClarify: false,
          shouldHandoff: false,
        },
      },
      tags: ["english", "pronoun", "followup"],
    };

    expect(evaluationCase.expectedResolvedIntent.future.requiresContextResolution).toBe(true);
    expect(evaluationCase.expectedAssistantBehavior.current.decisionType).toBe("low_signal_reply");
  });

  test("tracks prompt-history provenance inside context usage events", () => {
    const event: ContextUsageEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      usedRecentTurns: true,
      usedConversationState: false,
      usedSummary: false,
      usedQuotedReference: true,
      usedGroundingFacts: false,
      stage: "prompt_assembly",
      promptHistorySelectionMode: "quoted_reference_window",
    };

    expect(event.promptHistorySelectionMode).toBe("quoted_reference_window");
    expect(event.usedQuotedReference).toBe(true);
  });

  test("tracks canonical-state load, write, and fallback-mismatch diagnostics", () => {
    const loadEvent: CanonicalConversationStateLoadEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      invalidatedPaths: ["currentFocus", "heuristicHints.heuristicFocus"],
      freshnessStatus: "stale",
      authoritativeFocusKind: "none",
      authoritativeFocusEntityCount: 0,
      heuristicCandidateCount: 2,
    };
    const writeEvent: CanonicalConversationStateWriteEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      authoritativeFocusKind: "product",
      authoritativeFocusEntityCount: 1,
      authoritativeFocusSource: "retrieval_single_candidate",
      pendingClarificationActive: false,
      heuristicCandidateCount: 1,
      latestStandaloneQueryStatus: "unresolved_passthrough",
      responseLanguage: "en",
    };
    const fallbackMismatchEvent: CanonicalConversationStateFallbackMismatchEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      retrievalOutcome: "low_signal",
      freshnessStatus: "fresh",
      promptHistorySelectionMode: "quoted_reference_window",
      authoritativeFocusKind: "product",
      authoritativeFocusSource: "retrieval_single_candidate",
      heuristicCandidateCount: 2,
    };

    expect(loadEvent.invalidatedPaths).toHaveLength(2);
    expect(writeEvent.authoritativeFocusSource).toBe("retrieval_single_candidate");
    expect(fallbackMismatchEvent.promptHistorySelectionMode).toBe("quoted_reference_window");
  });

  test("tracks turn-resolution diagnostics for source selection, passthrough, clarification, and shadow disagreements", () => {
    const sourceSelectionEvent: ResolutionSourceSelectionEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      selectedResolutionSource: "current_focus",
      resolvedIntent: "entity_followup",
      preferredRetrievalMode: "semantic_catalog_search",
      resolutionConfidence: "high",
      clarificationRequired: false,
      selectedSources: ["current_focus"],
      supportingSources: ["recent_turns"],
      conflictingSources: ["summary"],
      discardedSources: ["raw_text"],
    };
    const clarificationEvent: ResolutionClarificationShortCircuitEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      selectedResolutionSource: "last_presented_list",
      resolutionConfidence: "low",
      preferredRetrievalMode: "clarification_required",
      clarificationReason: "multiple_candidate_lists",
    };
    const passthroughEvent: ResolutionPassthroughEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      selectedResolutionSource: "raw_text",
      preferredRetrievalMode: "semantic_catalog_search",
      queryStatus: "resolved_passthrough",
      passthroughReason: "already_standalone",
    };
    const shadowDisagreementEvent: ResolutionShadowDisagreementEvent = {
      conversationId: "conversation-1",
      requestId: "request-1",
      deterministicSource: "current_focus",
      deterministicMode: "semantic_catalog_search",
      shadowMode: "variant_lookup",
      deterministicConfidence: "medium",
      shadowConfidence: "high",
    };

    expect(sourceSelectionEvent.selectedSources).toContain("current_focus");
    expect(clarificationEvent.preferredRetrievalMode).toBe("clarification_required");
    expect(passthroughEvent.passthroughReason).toBe("already_standalone");
    expect(shadowDisagreementEvent.shadowMode).toBe("variant_lookup");
  });
});
