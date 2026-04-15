import { describe, expect, test } from 'bun:test';
import type { ChatProviderManager, PromptHistoryTurn } from '@cs/ai';
import {
  buildQuotedMessageCombinedFallbackQuery,
  buildRetrievalQueryPlan,
  buildRetrievalRewriteInput,
  createRetrievalRewriteService,
  mergeRetrievalResults,
  parseRetrievalRewriteResult,
} from './retrievalRewrite';

const quotedMessage: PromptHistoryTurn = {
  role: "assistant",
  text: "Burger Box Large",
};

describe("retrieval rewrite helpers", () => {
  test("builds rewrite input from a recent history slice", () => {
    const result = buildRetrievalRewriteInput({
      userMessage: "Do you have the large one?",
      conversation: {
        history: [
          {
            role: "user",
            text: "Show me burger boxes",
          },
          quotedMessage,
        ],
        historySelection: {
          reason: "recent_window",
        },
      },
      responseLanguageHint: "en",
    });

    expect(result).toEqual({
      currentUserMessage: "Do you have the large one?",
      selectedHistory: [
        {
          role: "user",
          text: "Show me burger boxes",
        },
        quotedMessage,
      ],
      historySelectionReason: "recent_window",
      responseLanguageHint: "en",
    });
  });

  test("builds rewrite input from a quoted reply slice and includes the quoted message", () => {
    const result = buildRetrievalRewriteInput({
      userMessage: "How much is this one?",
      conversation: {
        history: [
          {
            role: "user",
            text: "Send me burger box options",
          },
          quotedMessage,
        ],
        historySelection: {
          reason: "quoted_reply_slice",
          quotedMessage,
        },
      },
      responseLanguageHint: "en",
      catalogLanguageHints: ["en", "ar"],
    });

    expect(result).toEqual({
      currentUserMessage: "How much is this one?",
      selectedHistory: [
        {
          role: "user",
          text: "Send me burger box options",
        },
        quotedMessage,
      ],
      historySelectionReason: "quoted_reply_slice",
      quotedMessage,
      responseLanguageHint: "en",
      catalogLanguageHints: ["en", "ar"],
    });
  });

  test("parses a valid structured rewrite result and caps aliases", () => {
    expect(
      parseRetrievalRewriteResult(
        JSON.stringify({
          resolvedQuery: "Burger Box Large",
          confidence: "high",
          rewriteStrategy: "quoted_reply_resolution",
          preservedTerms: ["Burger Box", "Large"],
          searchAliases: ["Large Burger Box", "علبة برجر كبيرة", "Large Burger Box"],
          unresolvedReason: "ambiguous_reference",
          notes: "Use the quoted product label.",
        }),
      ),
    ).toEqual({
      resolvedQuery: "Burger Box Large",
      confidence: "high",
      rewriteStrategy: "quoted_reply_resolution",
      preservedTerms: ["Burger Box", "Large"],
      searchAliases: ["Large Burger Box", "علبة برجر كبيرة"],
      unresolvedReason: "ambiguous_reference",
      notes: "Use the quoted product label.",
    });
  });

  test("rejects invalid rewrite output", () => {
    expect(() => parseRetrievalRewriteResult("{")).toThrow(
      "Retrieval rewrite output must be valid JSON",
    );
    expect(() =>
      parseRetrievalRewriteResult(
        JSON.stringify({
          resolvedQuery: "",
          confidence: "high",
          rewriteStrategy: "standalone",
          preservedTerms: [],
        }),
      )
    ).toThrow("Retrieval rewrite resolvedQuery must be a non-empty string");
  });

  test("requests provider-enforced structured output for rewrite calls", async () => {
    const requests: unknown[] = [];
    const chatManager: ChatProviderManager = {
      async chat(request) {
        requests.push(request);
        return {
          provider: "gemini",
          model: "gemini-rewrite",
          text: JSON.stringify({
            resolvedQuery: "Burger Box Large",
            confidence: "high",
            rewriteStrategy: "quoted_reply_resolution",
            preservedTerms: ["Burger Box", "Large"],
          }),
          finishReason: "stop",
        };
      },
      async probeProviders() {
        return [];
      },
    };

    const service = createRetrievalRewriteService({ chatManager });
    const attempt = await service.rewrite({
      currentUserMessage: "How much is this one?",
      selectedHistory: [quotedMessage],
      historySelectionReason: "quoted_reply_slice",
      quotedMessage,
      responseLanguageHint: "en",
    });

    expect(attempt).toEqual({
      status: "success",
      result: {
        resolvedQuery: "Burger Box Large",
        confidence: "high",
        rewriteStrategy: "quoted_reply_resolution",
        preservedTerms: ["Burger Box", "Large"],
      },
    });
    expect(requests).toEqual([
      expect.objectContaining({
        responseFormat: {
          type: "json_schema",
          jsonSchema: expect.objectContaining({
            name: "retrieval_rewrite_result",
            strict: true,
            schema: expect.objectContaining({
              type: "object",
            }),
          }),
        },
      }),
    ]);
  });

  test("degrades to deterministic fallback queries when the rewrite is low confidence", () => {
    expect(
      buildRetrievalQueryPlan({
        userMessage: "How much is this one?",
        quotedMessage,
        rewriteAttempt: {
          status: "failure",
          failureReason: "low_confidence",
          result: {
            resolvedQuery: "Burger Box",
            confidence: "low",
            rewriteStrategy: "quoted_reply_resolution",
            preservedTerms: ["Burger Box"],
          },
        },
      }),
    ).toEqual({
      mode: "rewrite_degraded",
      primaryQuery: "How much is this one?",
      queries: [
        {
          text: "How much is this one?",
          source: "fallback_original_user_message",
        },
        {
          text: "Burger Box Large\nHow much is this one?",
          source: "fallback_quoted_message_plus_current_message",
        },
      ],
      rewriteAttempt: {
        status: "failure",
        failureReason: "low_confidence",
        result: {
          resolvedQuery: "Burger Box",
          confidence: "low",
          rewriteStrategy: "quoted_reply_resolution",
          preservedTerms: ["Burger Box"],
        },
      },
    });
  });

  test("merges alias-query retrieval results by product and preserves query provenance", () => {
    const queryPlan = buildRetrievalQueryPlan({
      userMessage: "the large one",
      rewriteAttempt: {
        status: "success",
        result: {
          resolvedQuery: "Burger Box Large",
          confidence: "high",
          rewriteStrategy: "quoted_reply_resolution",
          preservedTerms: ["Burger Box", "Large"],
          searchAliases: ["Large Burger Box"],
        },
      },
    });

    const merged = mergeRetrievalResults({
      queryPlan,
      maxContextBlocks: 2,
      retrievals: [
        {
          outcome: "grounded",
          query: "Burger Box Large",
          language: "en",
          topScore: 0.91,
          candidates: [
            {
              productId: "product-1",
              score: 0.91,
              contextBlock: {
                id: "product-1",
                heading: "Burger Box Large",
                body: "Name (EN): Burger Box Large",
              },
              productName: "Burger Box Large",
            },
          ],
          contextBlocks: [],
        },
        {
          outcome: "grounded",
          query: "Large Burger Box",
          language: "en",
          topScore: 0.96,
          candidates: [
            {
              productId: "product-1",
              score: 0.96,
              contextBlock: {
                id: "product-1",
                heading: "Burger Box Large",
                body: "Name (EN): Burger Box Large",
              },
              productName: "Burger Box Large",
            },
            {
              productId: "product-2",
              score: 0.8,
              contextBlock: {
                id: "product-2",
                heading: "Burger Box Medium",
                body: "Name (EN): Burger Box Medium",
              },
              productName: "Burger Box Medium",
            },
          ],
          contextBlocks: [],
        },
      ],
    });

    expect(merged).toEqual({
      outcome: "grounded",
      query: "Burger Box Large",
      language: "en",
      topScore: 0.96,
      candidates: [
        {
          productId: "product-1",
          score: 0.96,
          contextBlock: {
            id: "product-1",
            heading: "Burger Box Large",
            body: "Name (EN): Burger Box Large",
          },
          productName: "Burger Box Large",
          queryProvenance: [
            {
              query: "Large Burger Box",
              source: "search_alias",
              score: 0.96,
            },
            {
              query: "Burger Box Large",
              source: "resolved_query",
              score: 0.91,
            },
          ],
        },
        {
          productId: "product-2",
          score: 0.8,
          contextBlock: {
            id: "product-2",
            heading: "Burger Box Medium",
            body: "Name (EN): Burger Box Medium",
          },
          productName: "Burger Box Medium",
          queryProvenance: [
            {
              query: "Large Burger Box",
              source: "search_alias",
              score: 0.8,
            },
          ],
        },
      ],
      contextBlocks: [
        {
          id: "product-1",
          heading: "Burger Box Large",
          body: "Name (EN): Burger Box Large",
        },
        {
          id: "product-2",
          heading: "Burger Box Medium",
          body: "Name (EN): Burger Box Medium",
        },
      ],
    });
  });

  test("builds a quoted fallback query only when both parts are present", () => {
    expect(buildQuotedMessageCombinedFallbackQuery(quotedMessage, "How much is this one?")).toBe(
      "Burger Box Large\nHow much is this one?",
    );
    expect(buildQuotedMessageCombinedFallbackQuery(undefined, "How much is this one?")).toBeUndefined();
    expect(buildQuotedMessageCombinedFallbackQuery(quotedMessage, "   ")).toBeUndefined();
  });
});
