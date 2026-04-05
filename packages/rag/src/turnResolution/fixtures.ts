import type {
  AssistantSemanticRecordForResolution,
  ConversationSummaryDto,
  ResolvedUserTurn,
  TurnResolutionInput,
} from '@cs/shared';
import type { TurnResolutionShadowModelOutput } from "./modelAssisted";

const createResolutionPolicy = (overrides: Partial<TurnResolutionInput["resolutionPolicy"]> = {}) => ({
  allowModelAssistedFallback: false,
  allowSemanticAssistantFallback: true,
  allowSummarySupport: true,
  staleContextWindowMs: 30 * 60 * 1_000,
  quotedReferenceOverridesStaleness: true,
  minimumConfidenceToProceed: "high" as const,
  allowMediumConfidenceProceed: true,
  maxSemanticFallbackDepth: 3,
  ...overrides,
});

const createCanonicalState = (
  overrides: Partial<NonNullable<TurnResolutionInput["canonicalState"]>> = {},
): NonNullable<TurnResolutionInput["canonicalState"]> => ({
  schemaVersion: "v1",
  conversationId: "conversation-1",
  companyId: "company-1",
  currentFocus: {
    kind: "none",
    entityIds: [],
  },
  pendingClarification: {
    active: false,
  },
  freshness: {
    status: "fresh",
    updatedAt: 1_000,
    activeWindowExpiresAt: 2_000,
  },
  sourceOfTruthMarkers: {},
  heuristicHints: {
    usedQuotedReference: false,
    topCandidates: [],
  },
  ...overrides,
});

const createSummary = (
  overrides: Partial<ConversationSummaryDto> = {},
): ConversationSummaryDto => ({
  summaryId: "summary-1",
  conversationId: "conversation-1",
  stablePreferences: [],
  importantResolvedDecisions: [],
  historicalContextNeededForFutureTurns: [],
  freshness: {
    status: "fresh",
    updatedAt: 1_000,
  },
  provenance: {
    source: "summary_job",
    generatedAt: 1_000,
  },
  coveredMessageRange: {},
  ...overrides,
});

const createSemanticRecord = (
  overrides: Partial<AssistantSemanticRecordForResolution> = {},
): AssistantSemanticRecordForResolution => ({
  semanticRecordId: "semantic-record-1",
  assistantMessageId: "assistant-message-1",
  actionType: "clarify",
  responseLanguage: "en",
  responseMode: "clarified",
  orderedPresentedEntityIds: ["product-1", "product-2"],
  presentedList: {
    kind: "product",
    items: [
      { displayIndex: 1, entityKind: "product", entityId: "product-1", score: 0.92 },
      { displayIndex: 2, entityKind: "product", entityId: "product-2", score: 0.84 },
    ],
  },
  referencedEntities: [
    { entityKind: "product", entityId: "product-1", source: "semantic_assistant_record", confidence: "high" },
    { entityKind: "product", entityId: "product-2", source: "semantic_assistant_record", confidence: "high" },
  ],
  resolvedStandaloneQueryUsed: {
    text: "burger box",
    status: "used",
  },
  createdAt: 1_100,
  ...overrides,
});

export interface TurnResolutionFixture {
  id: string;
  description: string;
  input: TurnResolutionInput;
  expected: Partial<ResolvedUserTurn>;
  expectedClarificationReason?: NonNullable<ResolvedUserTurn["clarification"]>["reason"];
  shadowModelResult?: TurnResolutionShadowModelOutput | null;
}

export const turnResolutionFixtures: TurnResolutionFixture[] = [
  {
    id: "arabic_ordinal_followup",
    description: "resolves Arabic ordinal follow-ups against a quoted assistant list",
    input: {
      rawInboundText: "الثاني",
      recentTurns: [{ role: "assistant", text: "1. علبة برجر\n2. علبة بيتزا" }],
      canonicalState: createCanonicalState({
        currentFocus: {
          kind: "product",
          entityIds: ["product-9"],
          source: "retrieval_single_candidate",
          updatedAt: 900,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      quotedReference: {
        transportMessageId: "quoted-1",
        conversationMessageId: "message-quoted-1",
        role: "assistant",
        text: "1. علبة برجر\n2. علبة بيتزا",
        presentedList: {
          kind: "product",
          items: [
            { displayIndex: 1, entityKind: "product", entityId: "product-1", score: 0.9 },
            { displayIndex: 2, entityKind: "product", entityId: "product-2", score: 0.85 },
          ],
        },
        referencedEntities: [
          { entityKind: "product", entityId: "product-1", source: "quoted_reference", confidence: "high" },
          { entityKind: "product", entityId: "product-2", source: "quoted_reference", confidence: "high" },
        ],
      },
      semanticAssistantRecords: [],
    },
    expected: {
      resolvedIntent: "entity_followup",
      preferredRetrievalMode: "direct_entity_lookup",
      queryStatus: "not_applicable",
      primaryEntityId: "product-2",
      selectedResolutionSource: "quoted_reference",
      resolutionConfidence: "high",
      clarificationRequired: false,
      language: "ar",
      presentedListTarget: {
        sourceListId: "quoted_reference:quoted-1",
        listKind: "product",
        targetedDisplayIndexes: [2],
      },
      referencedEntities: [{
        entityKind: "product",
        entityId: "product-2",
        source: "quoted_reference",
        confidence: "high",
      }],
    },
  },
  {
    id: "english_pronoun_followup",
    description: "rewrites English pronoun follow-ups from current focus and latest standalone query",
    input: {
      rawInboundText: "what sizes does it come in",
      recentTurns: [
        { role: "user", text: "Tell me about your burger box" },
        { role: "assistant", text: "Our burger box comes in medium and large sizes." },
      ],
      canonicalState: createCanonicalState({
        currentFocus: {
          kind: "product",
          entityIds: ["product-1"],
          source: "retrieval_single_candidate",
          updatedAt: 1_000,
        },
        latestStandaloneQuery: {
          text: "burger box",
          status: "unresolved_passthrough",
          source: "system_passthrough",
          updatedAt: 1_000,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      resolvedIntent: "entity_followup",
      preferredRetrievalMode: "semantic_catalog_search",
      queryStatus: "rewritten",
      standaloneQuery: "What sizes does burger box come in?",
      primaryEntityId: "product-1",
      selectedResolutionSource: "current_focus",
      resolutionConfidence: "high",
      clarificationRequired: false,
      language: "en",
    },
  },
  {
    id: "image_request_selected_product",
    description: "routes picture requests to direct entity lookup when one product is in focus",
    input: {
      rawInboundText: "send its picture",
      recentTurns: [],
      canonicalState: createCanonicalState({
        currentFocus: {
          kind: "product",
          entityIds: ["product-1"],
          source: "retrieval_single_candidate",
          updatedAt: 1_000,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      resolvedIntent: "image_request",
      preferredRetrievalMode: "direct_entity_lookup",
      queryStatus: "not_applicable",
      primaryEntityId: "product-1",
      selectedResolutionSource: "current_focus",
      clarificationRequired: false,
    },
  },
  {
    id: "variant_family_narrowing_ar",
    description: "resolves Arabic variant narrowing inside a known presented variant family",
    input: {
      rawInboundText: "منه الكبير",
      recentTurns: [{ role: "assistant", text: "1. الصغير\n2. الوسط\n3. الكبير" }],
      canonicalState: createCanonicalState({
        currentFocus: {
          kind: "product",
          entityIds: ["product-1"],
          source: "retrieval_single_candidate",
          updatedAt: 1_000,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      quotedReference: {
        transportMessageId: "quoted-variant-1",
        conversationMessageId: "message-quoted-variant-1",
        role: "assistant",
        text: "1. الصغير\n2. الوسط\n3. الكبير",
        presentedList: {
          kind: "variant",
          items: [
            { displayIndex: 1, entityKind: "variant", entityId: "variant-1" },
            { displayIndex: 2, entityKind: "variant", entityId: "variant-2" },
            { displayIndex: 3, entityKind: "variant", entityId: "variant-3" },
          ],
        },
        referencedEntities: [{
          entityKind: "product",
          entityId: "product-1",
          source: "quoted_reference",
          confidence: "high",
        }],
      },
      semanticAssistantRecords: [],
    },
    expected: {
      resolvedIntent: "entity_followup",
      preferredRetrievalMode: "variant_lookup",
      queryStatus: "not_applicable",
      primaryEntityId: "variant-3",
      selectedResolutionSource: "quoted_reference",
      clarificationRequired: false,
    },
  },
  {
    id: "same_turn_unresolved_ambiguity",
    description: "requires clarification when a singular follow-up has no anchor at all",
    input: {
      rawInboundText: "how much is it",
      recentTurns: [],
      canonicalState: createCanonicalState(),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      preferredRetrievalMode: "clarification_required",
      clarificationRequired: true,
      selectedResolutionSource: "raw_text",
    },
    expectedClarificationReason: "missing_required_entity",
  },
  {
    id: "quoted_stale_reply_override",
    description: "uses a quoted stale reply as the local anchor even when canonical focus is stale and different",
    input: {
      rawInboundText: "its picture",
      recentTurns: [],
      canonicalState: createCanonicalState({
        freshness: { status: "stale", updatedAt: 1_000 },
        currentFocus: {
          kind: "product",
          entityIds: ["product-9"],
          source: "retrieval_single_candidate",
          updatedAt: 900,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      quotedReference: {
        transportMessageId: "quoted-stale-1",
        conversationMessageId: "message-quoted-stale-1",
        role: "assistant",
        text: "Burger Box",
        referencedEntities: [{
          entityKind: "product",
          entityId: "product-2",
          source: "quoted_reference",
          confidence: "high",
        }],
      },
      semanticAssistantRecords: [],
    },
    expected: {
      resolvedIntent: "image_request",
      preferredRetrievalMode: "direct_entity_lookup",
      selectedResolutionSource: "quoted_reference",
      primaryEntityId: "product-2",
      clarificationRequired: false,
    },
  },
  {
    id: "multi_entity_focus_singular_pronoun",
    description: "clarifies singular pronouns against multi-entity current focus",
    input: {
      rawInboundText: "what sizes does it come in",
      recentTurns: [],
      canonicalState: createCanonicalState({
        currentFocus: {
          kind: "product",
          entityIds: ["product-1", "product-2"],
          source: "retrieval_single_candidate",
          updatedAt: 1_000,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      preferredRetrievalMode: "clarification_required",
      clarificationRequired: true,
      selectedResolutionSource: "current_focus",
    },
    expectedClarificationReason: "ambiguous_referent",
  },
  {
    id: "invalid_deleted_referenced_entity",
    description: "returns typed clarification when a quoted anchor survives but its bound entities were sanitized away",
    input: {
      rawInboundText: "send its picture",
      recentTurns: [],
      canonicalState: createCanonicalState(),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      quotedReference: {
        transportMessageId: "quoted-invalid-1",
        conversationMessageId: "message-quoted-invalid-1",
        role: "assistant",
        text: "Burger Box",
      },
      semanticAssistantRecords: [],
    },
    expected: {
      preferredRetrievalMode: "clarification_required",
      clarificationRequired: true,
      selectedResolutionSource: "quoted_reference",
    },
    expectedClarificationReason: "referenced_entity_invalid",
  },
  {
    id: "clarification_answer_missing_pending_state",
    description: "falls back to a fresh semantic assistant clarification turn when canonical pending clarification is missing",
    input: {
      rawInboundText: "the second one",
      recentTurns: [{ role: "assistant", text: "Which one do you mean? 1. Burger Box 2. Pizza Box" }],
      canonicalState: createCanonicalState(),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [createSemanticRecord()],
    },
    expected: {
      resolvedIntent: "clarification_answer",
      preferredRetrievalMode: "direct_entity_lookup",
      queryStatus: "not_applicable",
      primaryEntityId: "product-2",
      selectedResolutionSource: "semantic_assistant_record",
      clarificationRequired: false,
    },
  },
  {
    id: "raw_passthrough_safe_search",
    description: "passes through standalone catalog searches without rewriting",
    input: {
      rawInboundText: "burger box with lid",
      recentTurns: [],
      canonicalState: createCanonicalState(),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      resolvedIntent: "catalog_search",
      preferredRetrievalMode: "semantic_catalog_search",
      queryStatus: "resolved_passthrough",
      passthroughReason: "already_standalone",
      standaloneQuery: "burger box with lid",
      selectedResolutionSource: "raw_text",
      clarificationRequired: false,
    },
  },
  {
    id: "direct_entity_intent_emitted",
    description: "emits direct entity retrieval mode for direct follow-up questions even before step 5 executes it",
    input: {
      rawInboundText: "how much is it",
      recentTurns: [],
      canonicalState: createCanonicalState({
        currentFocus: {
          kind: "product",
          entityIds: ["product-1"],
          source: "retrieval_single_candidate",
          updatedAt: 1_000,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      resolvedIntent: "entity_followup",
      preferredRetrievalMode: "direct_entity_lookup",
      queryStatus: "not_applicable",
      primaryEntityId: "product-1",
      clarificationRequired: false,
    },
  },
  {
    id: "summary_present_stale_context",
    description: "uses summary only as supporting evidence and still clarifies stale referential follow-ups",
    input: {
      rawInboundText: "same as before",
      recentTurns: [],
      canonicalState: createCanonicalState({
        freshness: { status: "stale", updatedAt: 1_000 },
      }),
      conversationSummary: createSummary({
        durableCustomerGoal: "Find burger box sizes",
      }),
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      preferredRetrievalMode: "clarification_required",
      selectedResolutionSource: "summary",
      clarificationRequired: true,
    },
    expectedClarificationReason: "stale_context_without_anchor",
  },
  {
    id: "summary_absent_stale_context",
    description: "falls back to raw text when no summary exists for stale referential follow-ups",
    input: {
      rawInboundText: "same as before",
      recentTurns: [],
      canonicalState: createCanonicalState({
        freshness: { status: "stale", updatedAt: 1_000 },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy(),
      semanticAssistantRecords: [],
    },
    expected: {
      preferredRetrievalMode: "clarification_required",
      selectedResolutionSource: "raw_text",
      clarificationRequired: true,
    },
    expectedClarificationReason: "missing_required_entity",
  },
  {
    id: "shadow_disagreement_variant_family",
    description: "records shadow disagreement when model-assisted variant refinement disagrees with deterministic clarification",
    input: {
      rawInboundText: "the wider one",
      recentTurns: [{ role: "assistant", text: "1. Small\n2. Medium\n3. Large" }],
      canonicalState: createCanonicalState({
        currentFocus: {
          kind: "product",
          entityIds: ["product-1"],
          source: "retrieval_single_candidate",
          updatedAt: 1_000,
        },
      }),
      conversationSummary: null,
      resolutionPolicy: createResolutionPolicy({
        allowModelAssistedFallback: true,
      }),
      quotedReference: {
        transportMessageId: "quoted-shadow-1",
        conversationMessageId: "message-quoted-shadow-1",
        role: "assistant",
        text: "1. Small\n2. Medium\n3. Large",
        presentedList: {
          kind: "variant",
          items: [
            { displayIndex: 1, entityKind: "variant", entityId: "variant-1" },
            { displayIndex: 2, entityKind: "variant", entityId: "variant-2" },
            { displayIndex: 3, entityKind: "variant", entityId: "variant-3" },
          ],
        },
      },
      semanticAssistantRecords: [],
    },
    expected: {
      preferredRetrievalMode: "clarification_required",
      clarificationRequired: true,
      selectedResolutionSource: "quoted_reference",
      shadowModelAssistedResult: {
        agreedWithDeterministic: false,
        preferredRetrievalMode: "variant_lookup",
        resolutionConfidence: "medium",
      },
    },
    expectedClarificationReason: "low_confidence_resolution",
    shadowModelResult: {
      preferredRetrievalMode: "variant_lookup",
      resolutionConfidence: "medium",
    },
  },
];
