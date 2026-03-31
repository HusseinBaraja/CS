import { describe, expect, test } from "bun:test";
import type { ConversationEvaluationCase, ContextUsageEvent } from "./conversationalIntelligenceDiagnostics";

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
});
