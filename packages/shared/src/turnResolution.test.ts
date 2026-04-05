import { describe, expect, test } from "bun:test";
import type {
  ResolvedUserTurn,
  TurnResolutionInput,
} from "./turnResolution";

describe("turn resolution contracts", () => {
  test("supports a fully resolved entity follow-up turn", () => {
    const input: TurnResolutionInput = {
      rawInboundText: "what sizes does it come in",
      recentTurns: [
        { role: "user", text: "Tell me about the burger box" },
        { role: "assistant", text: "We have the burger box in three sizes." },
      ],
      canonicalState: null,
      conversationSummary: null,
      resolutionPolicy: {
        allowModelAssistedFallback: false,
        allowSemanticAssistantFallback: true,
        allowSummarySupport: true,
        staleContextWindowMs: 30 * 60 * 1_000,
        quotedReferenceOverridesStaleness: true,
        minimumConfidenceToProceed: "high",
        allowMediumConfidenceProceed: false,
      },
    };
    const resolvedTurn: ResolvedUserTurn = {
      rawInboundText: input.rawInboundText,
      normalizedInboundText: "what sizes does it come in",
      resolvedIntent: "entity_followup",
      preferredRetrievalMode: "semantic_catalog_search",
      queryStatus: "rewritten",
      standaloneQuery: "What sizes does the burger box come in?",
      presentedListTarget: null,
      referencedEntities: [
        {
          entityKind: "product",
          entityId: "product-1",
          source: "current_focus",
          confidence: "high",
        },
      ],
      primaryEntityId: "product-1",
      resolutionConfidence: "high",
      clarificationRequired: false,
      clarification: null,
      selectedResolutionSource: "current_focus",
      provenance: {
        selectedSources: [
          {
            source: "current_focus",
            evidence: [
              {
                kind: "canonical_state_path",
                value: "currentFocus",
              },
            ],
          },
        ],
        supportingSources: [],
        conflictingSources: [],
        discardedSources: [],
      },
      language: "en",
    };

    expect(resolvedTurn.standaloneQuery).toBe("What sizes does the burger box come in?");
    expect(resolvedTurn.referencedEntities[0]?.entityId).toBe("product-1");
  });
});
