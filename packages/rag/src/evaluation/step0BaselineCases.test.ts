import { describe, expect, test } from "bun:test";
import { getStep0BaselineCaseById, step0BaselineCases } from "./step0BaselineCases";

const REQUIRED_CASE_IDS = [
  "numbered_followup_ar",
  "pronoun_followup_en",
  "idle_gap_then_reference",
  "low_signal_raw_query_but_contextual_target_exists",
  "invalid_model_output_vs_provider_failure",
  "duplicate_inbound_not_counted",
  "media_only_turn_observable_without_text_metrics_distortion",
  "stale_unquoted_followup_resets_recent_history",
] as const;

describe("step0BaselineCases", () => {
  test("includes every required Step 0 baseline case exactly once", () => {
    const ids = step0BaselineCases.map((evaluationCase) => evaluationCase.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_CASE_IDS));
  });

  test("covers both Arabic and English cases", () => {
    const languages = new Set(step0BaselineCases.map((evaluationCase) => evaluationCase.language));

    expect(languages).toEqual(new Set(["ar", "en"]));
  });

  test("stores current and future expectations for every case", () => {
    for (const evaluationCase of step0BaselineCases) {
      expect(evaluationCase.title.length).toBeGreaterThan(0);
      expect(evaluationCase.tags.length).toBeGreaterThan(0);
      expect(evaluationCase.expectedResolvedIntent.current.standaloneQuery).not.toBeUndefined();
      expect(evaluationCase.expectedResolvedIntent.future.standaloneQuery).not.toBeUndefined();
      expect(evaluationCase.expectedRetrievalBehavior.current.retrievalMode).toBe("raw_latest_message");
      expect(evaluationCase.expectedRetrievalBehavior.future.retrievalMode).toBe("raw_latest_message");
      expect(evaluationCase.expectedAssistantBehavior.current.shouldHandoff).not.toBeUndefined();
      expect(evaluationCase.expectedAssistantBehavior.future.shouldClarify).not.toBeUndefined();
    }
  });

  test("supports lookup by case id", () => {
    expect(getStep0BaselineCaseById("numbered_followup_ar")?.language).toBe("ar");
    expect(getStep0BaselineCaseById("missing-case")).toBeUndefined();
  });
});
