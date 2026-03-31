import type {
  ConversationEvaluationCase,
  EvaluationAssistantBehaviorExpectation,
  EvaluationResolvedIntentExpectation,
  EvaluationRetrievalBehaviorExpectation,
} from "@cs/shared";
import { step0BaselineCases } from "./step0BaselineCases";

export interface Step0BaselineCaseObservation {
  caseId: string;
  resolvedIntent: EvaluationResolvedIntentExpectation;
  retrievalBehavior: EvaluationRetrievalBehaviorExpectation;
  assistantBehavior: EvaluationAssistantBehaviorExpectation;
}

export interface Step0BaselineMismatch {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface Step0BaselineCaseResult {
  caseId: string;
  title: string;
  passed: boolean;
  mismatches: Step0BaselineMismatch[];
  actual: Step0BaselineCaseObservation;
}

export interface Step0BaselineRunResult {
  passed: boolean;
  totalCaseCount: number;
  passedCaseCount: number;
  failedCaseCount: number;
  caseResults: Step0BaselineCaseResult[];
}

export type Step0BaselineExecutor = (
  evaluationCase: ConversationEvaluationCase,
) => Promise<Step0BaselineCaseObservation>;

export interface RunStep0BaselineCasesOptions {
  cases?: ConversationEvaluationCase[];
  executeCase: Step0BaselineExecutor;
}

const collectSectionMismatches = <TExpected extends object>(
  sectionName: string,
  expected: TExpected,
  actual: TExpected,
): Step0BaselineMismatch[] =>
  Object.entries(expected).flatMap(([key, expectedValue]) => {
    const actualValue = (actual as Record<string, unknown>)[key];

    if (actualValue === expectedValue) {
      return [];
    }

    return [{
      path: `${sectionName}.${key}`,
      expected: expectedValue,
      actual: actualValue,
    }];
  });

export const compareStep0BaselineCase = (
  evaluationCase: ConversationEvaluationCase,
  actual: Step0BaselineCaseObservation,
): Step0BaselineCaseResult => {
  const mismatches = [
    ...collectSectionMismatches(
      "resolvedIntent",
      evaluationCase.expectedResolvedIntent.current,
      actual.resolvedIntent,
    ),
    ...collectSectionMismatches(
      "retrievalBehavior",
      evaluationCase.expectedRetrievalBehavior.current,
      actual.retrievalBehavior,
    ),
    ...collectSectionMismatches(
      "assistantBehavior",
      evaluationCase.expectedAssistantBehavior.current,
      actual.assistantBehavior,
    ),
  ];

  return {
    caseId: evaluationCase.id,
    title: evaluationCase.title,
    passed: mismatches.length === 0,
    mismatches,
    actual,
  };
};

export const runStep0BaselineCases = async (
  options: RunStep0BaselineCasesOptions,
): Promise<Step0BaselineRunResult> => {
  const cases = options.cases ?? step0BaselineCases;
  const caseResults: Step0BaselineCaseResult[] = [];

  for (const evaluationCase of cases) {
    const actual = await options.executeCase(evaluationCase);
    caseResults.push(compareStep0BaselineCase(evaluationCase, actual));
  }

  const failedCaseCount = caseResults.filter((caseResult) => !caseResult.passed).length;

  return {
    passed: failedCaseCount === 0,
    totalCaseCount: caseResults.length,
    passedCaseCount: caseResults.length - failedCaseCount,
    failedCaseCount,
    caseResults,
  };
};

export const assertStep0BaselineCurrentExpectations = async (
  options: RunStep0BaselineCasesOptions,
): Promise<Step0BaselineRunResult> => {
  const result = await runStep0BaselineCases(options);

  if (result.passed) {
    return result;
  }

  const mismatchLines = result.caseResults
    .filter((caseResult) => !caseResult.passed)
    .flatMap((caseResult) =>
      caseResult.mismatches.map((mismatch) =>
        `${caseResult.caseId} ${mismatch.path}: expected ${JSON.stringify(mismatch.expected)} but received ${JSON.stringify(mismatch.actual)}`,
      )
    );

  throw new Error([
    `Step 0 baseline regression failed for ${result.failedCaseCount} case(s).`,
    ...mismatchLines,
  ].join("\n"));
};
