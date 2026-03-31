import { describe, expect, test } from "bun:test";
import { step0BaselineCases } from "./step0BaselineCases";
import {
  assertStep0BaselineCurrentExpectations,
  compareStep0BaselineCase,
  runStep0BaselineCases,
} from "./step0BaselineRunner";

describe("step0BaselineRunner", () => {
  test("passes when observations match the current expectations for every baseline case", async () => {
    const result = await runStep0BaselineCases({
      executeCase: async (evaluationCase) => ({
        caseId: evaluationCase.id,
        resolvedIntent: evaluationCase.expectedResolvedIntent.current,
        retrievalBehavior: evaluationCase.expectedRetrievalBehavior.current,
        assistantBehavior: evaluationCase.expectedAssistantBehavior.current,
      }),
    });

    expect(result).toMatchObject({
      passed: true,
      totalCaseCount: step0BaselineCases.length,
      passedCaseCount: step0BaselineCases.length,
      failedCaseCount: 0,
    });
  });

  test("reports mismatches against current expectations with stable field paths", () => {
    const evaluationCase = step0BaselineCases[0]!;
    const result = compareStep0BaselineCase(evaluationCase, {
      caseId: evaluationCase.id,
      resolvedIntent: {
        ...evaluationCase.expectedResolvedIntent.current,
        standaloneQuery: "unexpected query",
      },
      retrievalBehavior: evaluationCase.expectedRetrievalBehavior.current,
      assistantBehavior: {
        ...evaluationCase.expectedAssistantBehavior.current,
        shouldClarify: !evaluationCase.expectedAssistantBehavior.current.shouldClarify,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.mismatches).toEqual([
      {
        path: "resolvedIntent.standaloneQuery",
        expected: evaluationCase.expectedResolvedIntent.current.standaloneQuery,
        actual: "unexpected query",
      },
      {
        path: "assistantBehavior.shouldClarify",
        expected: evaluationCase.expectedAssistantBehavior.current.shouldClarify,
        actual: !evaluationCase.expectedAssistantBehavior.current.shouldClarify,
      },
    ]);
  });

  test("throws from the assertion helper when any current expectation regresses", async () => {
    await expect(assertStep0BaselineCurrentExpectations({
      cases: [step0BaselineCases[1]!],
      executeCase: async (evaluationCase) => ({
        caseId: evaluationCase.id,
        resolvedIntent: evaluationCase.expectedResolvedIntent.current,
        retrievalBehavior: {
          ...evaluationCase.expectedRetrievalBehavior.current,
          outcome: "grounded",
        },
        assistantBehavior: evaluationCase.expectedAssistantBehavior.current,
      }),
    })).rejects.toThrow("retrievalBehavior.outcome");
  });
});
