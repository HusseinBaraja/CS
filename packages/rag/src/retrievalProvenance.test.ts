import { describe, expect, test } from 'bun:test';
import { summarizePromptRetrievalProvenance } from './retrievalProvenance';

describe("summarizePromptRetrievalProvenance", () => {
  test("summarizes direct resolved-query grounding", () => {
    const summary = summarizePromptRetrievalProvenance({
      mode: "primary_rewrite",
      promptCandidateCount: 1,
      candidates: [
        {
          queryProvenance: [
            {
              query: "Burger Box",
              source: "resolved_query",
              score: 0.92,
            },
          ],
        },
      ],
    });

    expect(summary).toEqual({
      mode: "primary_rewrite",
      primarySource: "resolved_query",
      supportingSources: [],
      usedAliasCount: 0,
      convergedOnSharedProducts: false,
    });
  });

  test("tracks alias-supported grounding and distinct alias usage", () => {
    const summary = summarizePromptRetrievalProvenance({
      mode: "primary_rewrite",
      promptCandidateCount: 2,
      candidates: [
        {
          queryProvenance: [
            {
              query: "Burger Box",
              source: "resolved_query",
              score: 0.92,
            },
            {
              query: "Burger food container",
              source: "search_alias",
              score: 0.9,
            },
          ],
        },
        {
          queryProvenance: [
            {
              query: "Burger packaging box",
              source: "search_alias",
              score: 0.88,
            },
          ],
        },
      ],
    });

    expect(summary).toEqual({
      mode: "primary_rewrite",
      primarySource: "resolved_query",
      supportingSources: ["search_alias"],
      usedAliasCount: 2,
      convergedOnSharedProducts: true,
    });
  });

  test("distinguishes quoted fallback from original-message fallback", () => {
    const summary = summarizePromptRetrievalProvenance({
      mode: "rewrite_degraded",
      promptCandidateCount: 2,
      candidates: [
        {
          queryProvenance: [
            {
              query: "Burger Box Large\nHow much is this one?",
              source: "fallback_quoted_message_plus_current_message",
              score: 0.94,
            },
            {
              query: "How much is this one?",
              source: "fallback_original_user_message",
              score: 0.81,
            },
          ],
        },
        {
          queryProvenance: [
            {
              query: "How much is this one?",
              source: "fallback_original_user_message",
              score: 0.75,
            },
          ],
        },
      ],
    });

    expect(summary).toEqual({
      mode: "rewrite_degraded",
      primarySource: "quoted_message_fallback",
      supportingSources: ["original_message_fallback"],
      usedAliasCount: 0,
      convergedOnSharedProducts: true,
    });
  });
});
