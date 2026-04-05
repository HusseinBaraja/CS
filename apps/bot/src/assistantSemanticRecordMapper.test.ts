import { describe, expect, test } from 'bun:test';
import type { CatalogChatResult } from '@cs/rag';
import type { CanonicalConversationStateDto } from '@cs/shared';
import {
  buildAssistantSemanticRecordInput,
  DEFAULT_TURN_RESOLUTION_POLICY,
  toAssistantSemanticRecordForResolution,
} from './assistantSemanticRecordMapper';

const createCanonicalState = (): CanonicalConversationStateDto => ({
  schemaVersion: "v1",
  conversationId: "conversation-1",
  companyId: "company-1",
  currentFocus: {
    kind: "product",
    entityIds: ["product-1"],
    source: "retrieval_single_candidate",
    updatedAt: 900,
  },
  pendingClarification: {
    active: false,
  },
  freshness: {
    status: "fresh",
    updatedAt: 900,
    activeWindowExpiresAt: 1_800,
  },
  sourceOfTruthMarkers: {
    currentFocus: "retrieval_single_candidate",
  },
  heuristicHints: {
    usedQuotedReference: false,
    topCandidates: [],
  },
});

const createGroundedChatResponse = (assistantText: string): CatalogChatResult => ({
  outcome: "provider_response",
  assistant: {
    schemaVersion: "v1",
    text: assistantText,
    action: {
      type: "none",
    },
  },
  language: {
    classification: "en",
    responseLanguage: "en",
    arabicCharCount: 0,
    englishCharCount: 10,
    hasArabic: false,
    hasEnglish: true,
  },
  retrieval: {
    outcome: "grounded",
    query: "burger box",
    language: "en",
    topScore: 0.92,
    candidates: [
      {
        productId: "product-1",
        score: 0.92,
        matchedEmbeddingId: "embedding-1",
        matchedText: "Burger Box",
        language: "en",
        contextBlock: {
          id: "product-1",
          heading: "Burger Box",
          body: "Name (EN): Burger Box",
        },
        product: {
          id: "product-1",
          categoryId: "category-1",
          nameEn: "Burger Box",
          imageCount: 1,
          variants: [],
        },
      },
      {
        productId: "product-2",
        score: 0.88,
        matchedEmbeddingId: "embedding-2",
        matchedText: "Pizza Box",
        language: "en",
        contextBlock: {
          id: "product-2",
          heading: "Pizza Box",
          body: "Name (EN): Pizza Box",
        },
        product: {
          id: "product-2",
          categoryId: "category-1",
          nameEn: "Pizza Box",
          imageCount: 0,
          variants: [],
        },
      },
    ],
    contextBlocks: [],
  },
});

describe("assistant semantic record mapper", () => {
  test("maps a grounded assistant answer into a semantic record", () => {
    const record = buildAssistantSemanticRecordInput({
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "assistant-message-1",
      assistantText: "Burger Box is available in multiple sizes.",
      chatResponse: createGroundedChatResponse("Burger Box is available in multiple sizes."),
      canonicalState: createCanonicalState(),
      createdAt: 2_000,
    });

    expect(record).toEqual({
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "assistant-message-1",
      schemaVersion: "v1",
      actionType: "none",
      normalizedAction: "answer",
      semanticRecordStatus: "complete",
      presentedNumberedList: false,
      orderedPresentedEntityIds: [],
      displayIndexToEntityIdMap: [],
      referencedEntities: [{
        entityKind: "product",
        entityId: "product-1",
        source: "raw_text",
        confidence: "high",
      }],
      resolvedStandaloneQueryUsed: {
        text: "burger box",
        status: "used",
      },
      responseLanguage: "en",
      responseMode: "grounded",
      groundingSourceMetadata: {
        usedRetrieval: true,
        usedConversationState: false,
        usedSummary: false,
        retrievalMode: "raw_latest_message",
        groundedEntityIds: ["product-1"],
      },
      stateMutationHints: {
        focusKind: "product",
        focusEntityIds: ["product-1"],
        shouldSetPendingClarification: false,
        latestStandaloneQueryText: "burger box",
      },
      createdAt: 2_000,
    });
  });

  test("captures numbered multi-product assistant lists", () => {
    const record = buildAssistantSemanticRecordInput({
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "assistant-message-2",
      assistantText: "1. Burger Box\n2. Pizza Box",
      chatResponse: createGroundedChatResponse("1. Burger Box\n2. Pizza Box"),
      canonicalState: createCanonicalState(),
      createdAt: 2_100,
    });

    expect(record.normalizedAction).toBe("present_list");
    expect(record.presentedNumberedList).toBe(true);
    expect(record.orderedPresentedEntityIds).toEqual(["product-1", "product-2"]);
    expect(record.displayIndexToEntityIdMap).toEqual([
      { displayIndex: 1, entityId: "product-1" },
      { displayIndex: 2, entityId: "product-2" },
    ]);
    expect(record.presentedList).toEqual({
      kind: "product",
      items: [
        { displayIndex: 1, entityKind: "product", entityId: "product-1", score: 0.92 },
        { displayIndex: 2, entityKind: "product", entityId: "product-2", score: 0.88 },
      ],
    });
  });

  test("maps handoff fallbacks and converts stored records for resolution input", () => {
    const record = buildAssistantSemanticRecordInput({
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "assistant-message-3",
      assistantText: "I can't help safely right now, so I'll connect you with the team.",
      chatResponse: {
        ...createGroundedChatResponse("I can't help safely right now, so I'll connect you with the team."),
        outcome: "provider_failure_fallback",
        assistant: {
          schemaVersion: "v1",
          text: "I can't help safely right now, so I'll connect you with the team.",
          action: {
            type: "handoff",
          },
        },
      },
      canonicalState: createCanonicalState(),
      createdAt: 2_200,
    });

    expect(record.normalizedAction).toBe("handoff");
    expect(record.responseMode).toBe("handoff");
    expect(record.handoffRationale).toEqual({
      reasonCode: "provider_failure",
    });

    expect(toAssistantSemanticRecordForResolution({
      id: "semantic-record-1",
      ...record,
    })).toEqual({
      semanticRecordId: "semantic-record-1",
      assistantMessageId: "assistant-message-3",
      actionType: "handoff",
      responseLanguage: "en",
      responseMode: "handoff",
      orderedPresentedEntityIds: [],
      referencedEntities: [{
        entityKind: "product",
        entityId: "product-1",
        source: "current_focus",
        confidence: "high",
      }],
      resolvedStandaloneQueryUsed: {
        text: "burger box",
        status: "used",
      },
      createdAt: 2_200,
    });
  });

  test("exposes the default turn-resolution policy used by the bot", () => {
    expect(DEFAULT_TURN_RESOLUTION_POLICY).toEqual({
      allowModelAssistedFallback: false,
      allowSemanticAssistantFallback: true,
      allowSummarySupport: true,
      staleContextWindowMs: 1_800_000,
      quotedReferenceOverridesStaleness: true,
      minimumConfidenceToProceed: "high",
      allowMediumConfidenceProceed: false,
      maxSemanticFallbackDepth: 3,
    });
  });
});
