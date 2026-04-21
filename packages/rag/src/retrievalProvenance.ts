import type { PromptRetrievalProvenance, PromptRetrievalQuerySource } from '@cs/ai';
import type { RetrievalMode, RetrievalQueryProvenance, RetrievalQuerySource } from './retrievalRewrite';

export interface PromptRetrievalProvenanceCandidate {
  queryProvenance?: RetrievalQueryProvenance[];
}

const DEFAULT_PROMPT_CANDIDATE_COUNT = 1;

const getDefaultPrimarySource = (
  mode: RetrievalMode,
): PromptRetrievalQuerySource => {
  switch (mode) {
    case "rewrite_degraded":
      return "original_message_fallback";
    case "primary_rewrite":
      return "resolved_query";
  }
};

const toPromptRetrievalQuerySource = (
  source: RetrievalQuerySource,
): PromptRetrievalQuerySource => {
  switch (source) {
    case "resolved_query":
      return "resolved_query";
    case "search_alias":
      return "search_alias";
    case "fallback_original_user_message":
      return "original_message_fallback";
    case "fallback_quoted_message_plus_current_message":
      return "quoted_message_fallback";
  }
};

const normalizePromptCandidateCount = (value: number | undefined): number => {
  if (value === undefined) {
    return DEFAULT_PROMPT_CANDIDATE_COUNT;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : DEFAULT_PROMPT_CANDIDATE_COUNT;
};

const getPromptSourcePriority = (source: PromptRetrievalQuerySource): number => {
  switch (source) {
    case "resolved_query":
      return 0;
    case "search_alias":
      return 1;
    case "original_message_fallback":
      return 2;
    case "quoted_message_fallback":
      return 3;
  }
};

export const summarizePromptRetrievalProvenance = (input: {
  mode: RetrievalMode;
  candidates: PromptRetrievalProvenanceCandidate[];
  promptCandidateCount?: number;
}): PromptRetrievalProvenance => {
  const promptCandidates = input.candidates.slice(
    0,
    normalizePromptCandidateCount(input.promptCandidateCount),
  );
  const promptQueryProvenance = promptCandidates
    .flatMap((candidate) => candidate.queryProvenance ?? [])
    .map((entry) => ({
      ...entry,
      promptSource: toPromptRetrievalQuerySource(entry.source),
    }))
    .sort((left, right) =>
      right.score - left.score
      || getPromptSourcePriority(left.promptSource) - getPromptSourcePriority(right.promptSource)
      || left.query.localeCompare(right.query)
    );

  if (promptQueryProvenance.length === 0) {
    return {
      mode: input.mode,
      primarySource: getDefaultPrimarySource(input.mode),
      supportingSources: [],
      usedAliasCount: 0,
      convergedOnSharedProducts: false,
    };
  }

  const primarySource = promptQueryProvenance[0]!.promptSource;
  const supportingSources = [
    ...new Set(
      promptQueryProvenance
        .slice(1)
        .map((entry) => entry.promptSource)
        .filter((source) => source !== primarySource),
    ),
  ];
  const usedAliasCount = new Set(
    promptQueryProvenance
      .filter((entry) => entry.source === "search_alias")
      .map((entry) => entry.query),
  ).size;
  const convergedOnSharedProducts = promptCandidates.some((candidate) =>
    (candidate.queryProvenance?.length ?? 0) > 1
  );

  return {
    mode: input.mode,
    primarySource,
    supportingSources,
    usedAliasCount,
    convergedOnSharedProducts,
  };
};
