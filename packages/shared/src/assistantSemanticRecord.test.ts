import { describe, expect, test } from "bun:test";
import type { AssistantSemanticRecordDto } from "./assistantSemanticRecord";

describe("assistant semantic record contracts", () => {
  test("supports a persisted assistant semantic record shape", () => {
    const record: AssistantSemanticRecordDto = {
      id: "semantic-1",
      schemaVersion: "v1",
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "message-1",
      actionType: "clarify",
      normalizedAction: "clarify",
      semanticRecordStatus: "complete",
      presentedNumberedList: true,
      orderedPresentedEntityIds: ["product-1", "product-2"],
      displayIndexToEntityIdMap: [
        { displayIndex: 1, entityId: "product-1" },
        { displayIndex: 2, entityId: "product-2" },
      ],
      referencedEntities: [
        {
          entityKind: "product",
          entityId: "product-1",
          source: "semantic_assistant_record",
          confidence: "high",
        },
      ],
      resolvedStandaloneQueryUsed: {
        text: "burger boxes",
        status: "used",
      },
      responseLanguage: "en",
      responseMode: "grounded",
      groundingSourceMetadata: {
        usedRetrieval: true,
        usedConversationState: true,
        usedSummary: false,
        retrievalMode: "semantic_catalog_search",
        groundedEntityIds: ["product-1"],
      },
      clarificationRationale: {
        reasonCode: "missing_variant",
      },
      stateMutationHints: {
        focusKind: "product",
        focusEntityIds: ["product-1"],
        shouldSetPendingClarification: true,
      },
      createdAt: 1_000,
    };

    expect(record.displayIndexToEntityIdMap[1]?.entityId).toBe("product-2");
    expect(record.groundingSourceMetadata.retrievalMode).toBe("semantic_catalog_search");
  });
});
