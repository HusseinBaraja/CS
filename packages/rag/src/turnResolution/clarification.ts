import type {
  ResolvedIntent,
  ResolvedUserTurn,
  TurnClarificationPromptStrategy,
  TurnClarificationReason,
  TurnClarificationTarget,
  TurnResolutionConfidence,
  TurnSelectedResolutionSource,
} from '@cs/shared';

export const buildClarificationTurn = (
  input: {
    rawInboundText: string;
    normalizedInboundText: string;
    language: "ar" | "en";
    selectedResolutionSource: TurnSelectedResolutionSource;
    resolutionConfidence: TurnResolutionConfidence;
    clarificationReason: TurnClarificationReason;
    clarificationTarget: TurnClarificationTarget;
    promptStrategy: TurnClarificationPromptStrategy;
    resolvedIntent?: ResolvedIntent;
    referencedEntities?: ResolvedUserTurn["referencedEntities"];
    provenance: ResolvedUserTurn["provenance"];
  },
): ResolvedUserTurn => ({
  rawInboundText: input.rawInboundText,
  normalizedInboundText: input.normalizedInboundText,
  resolvedIntent: input.resolvedIntent ?? "ambiguous_unresolved",
  preferredRetrievalMode: "clarification_required",
  queryStatus: "not_applicable",
  standaloneQuery: null,
  presentedListTarget: null,
  referencedEntities: input.referencedEntities ?? [],
  primaryEntityId: input.referencedEntities?.[0]?.entityId ?? null,
  resolutionConfidence: input.resolutionConfidence,
  clarificationRequired: true,
  clarification: {
    reason: input.clarificationReason,
    target: input.clarificationTarget,
    suggestedPromptStrategy: input.promptStrategy,
  },
  selectedResolutionSource: input.selectedResolutionSource,
  provenance: input.provenance,
  language: input.language,
});
