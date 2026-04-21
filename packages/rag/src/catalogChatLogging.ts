import { summarizeTextForLog } from "@cs/core";
import type { RetrievalRewriteAttempt } from "./retrievalRewrite";

interface RetrievalLogContextInput {
  outcome: string;
  reason?: string;
  topScore?: number;
  candidates: unknown[];
  contextBlocks: unknown[];
  language: string;
  retrievalMode?: string;
}

export const summarizeQueryForLog = (text: string) => {
  const summary = summarizeTextForLog(text);

  return {
    queryTextLength: summary.textLength,
    queryTextLineCount: summary.textLineCount,
  };
};

export const summarizePrimaryRetrievalQueryForLog = (text: string) => {
  const summary = summarizeTextForLog(text);

  return {
    primaryQueryTextLength: summary.textLength,
    primaryQueryTextLineCount: summary.textLineCount,
  };
};

export const summarizeProviderTextForLog = (text: string) => {
  const summary = summarizeTextForLog(text);

  return {
    providerTextLength: summary.textLength,
    providerTextLineCount: summary.textLineCount,
  };
};

export const buildRetrievalLogContext = (
  retrieval: RetrievalLogContextInput,
): Record<string, unknown> => ({
  outcome: retrieval.outcome,
  ...(retrieval.reason ? { reason: retrieval.reason } : {}),
  ...(retrieval.topScore !== undefined ? { topScore: retrieval.topScore } : {}),
  candidateCount: retrieval.candidates.length,
  contextBlockCount: retrieval.contextBlocks.length,
  language: retrieval.language,
  ...(retrieval.retrievalMode ? { retrievalMode: retrieval.retrievalMode } : {}),
});

export const buildRewriteLogContext = (
  rewrite: RetrievalRewriteAttempt | undefined,
): Record<string, unknown> => {
  if (!rewrite) {
    return {
      outcome: "not_attempted",
    };
  }

  if (rewrite.status === "success") {
    return {
      outcome: "success",
      confidence: rewrite.result.confidence,
      strategy: rewrite.result.rewriteStrategy,
      aliasCount: rewrite.result.searchAliases?.length ?? 0,
      ...(rewrite.result.unresolvedReason ? { unresolvedReason: rewrite.result.unresolvedReason } : {}),
    };
  }

  return {
    outcome: "failure",
    failureReason: rewrite.failureReason,
    ...(rewrite.result
      ? {
        confidence: rewrite.result.confidence,
        strategy: rewrite.result.rewriteStrategy,
        aliasCount: rewrite.result.searchAliases?.length ?? 0,
        ...(rewrite.result.unresolvedReason ? { unresolvedReason: rewrite.result.unresolvedReason } : {}),
      }
      : {}),
  };
};
