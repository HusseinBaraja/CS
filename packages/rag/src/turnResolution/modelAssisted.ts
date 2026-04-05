import type {
  ResolvedUserTurn,
  TurnPreferredRetrievalMode,
  TurnResolutionConfidence,
  TurnSelectedResolutionSource,
} from '@cs/shared';

export interface TurnResolutionShadowCandidateFamily {
  source: TurnSelectedResolutionSource;
  familyKind: "variant";
  entityIds: string[];
}

export interface TurnResolutionShadowModelInput {
  rawInboundText: string;
  normalizedInboundText: string;
  language: "ar" | "en";
  candidateFamily: TurnResolutionShadowCandidateFamily;
}

export interface TurnResolutionShadowModelOutput {
  preferredRetrievalMode: TurnPreferredRetrievalMode;
  resolutionConfidence: TurnResolutionConfidence;
}

export type TurnResolutionShadowModelRefiner = (
  input: TurnResolutionShadowModelInput,
) => Promise<TurnResolutionShadowModelOutput | null>;

export const applyShadowModelResult = (
  resolvedTurn: ResolvedUserTurn,
  shadowResult: TurnResolutionShadowModelOutput | null,
): ResolvedUserTurn => {
  if (!shadowResult) {
    return resolvedTurn;
  }

  return {
    ...resolvedTurn,
    shadowModelAssistedResult: {
      agreedWithDeterministic:
        shadowResult.preferredRetrievalMode === resolvedTurn.preferredRetrievalMode
        && shadowResult.resolutionConfidence === resolvedTurn.resolutionConfidence,
      preferredRetrievalMode: shadowResult.preferredRetrievalMode,
      resolutionConfidence: shadowResult.resolutionConfidence,
    },
  };
};
