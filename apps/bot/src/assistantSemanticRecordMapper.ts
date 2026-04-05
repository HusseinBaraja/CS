import type { CatalogChatResult, RetrievedProductCandidate } from '@cs/rag';
import type {
  AssistantSemanticRecordDto,
  AssistantSemanticRecordForResolution,
  CanonicalConversationFocusKind,
  CanonicalConversationPresentableKind,
  CanonicalConversationPresentedListDto,
  CanonicalConversationStateDto,
  TurnReferencedEntity,
  TurnResolutionPolicy,
} from '@cs/shared';

export const DEFAULT_TURN_RESOLUTION_POLICY: TurnResolutionPolicy = {
  allowModelAssistedFallback: false,
  allowSemanticAssistantFallback: true,
  allowSummarySupport: true,
  staleContextWindowMs: 30 * 60 * 1_000,
  quotedReferenceOverridesStaleness: true,
  minimumConfidenceToProceed: "high",
  allowMediumConfidenceProceed: false,
  maxSemanticFallbackDepth: 3,
};

export interface BuildAssistantSemanticRecordInput {
  companyId: string;
  conversationId: string;
  assistantMessageId: string;
  assistantText: string;
  chatResponse: CatalogChatResult;
  canonicalState: CanonicalConversationStateDto | null;
  createdAt: number;
}

export type PersistAssistantSemanticRecordInput = Omit<AssistantSemanticRecordDto, "id">;

const normalizeTextForMatch = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const hasNumberedListFormatting = (text: string): boolean =>
  /(^|\n)\s*\d+[\.\)]\s+/m.test(text);

const getCandidateNames = (candidate: RetrievedProductCandidate): string[] =>
  [candidate.product.nameEn, candidate.product.nameAr]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeTextForMatch(value));

const selectGroundedCandidatesShownInAssistantText = (
  assistantText: string,
  candidates: RetrievedProductCandidate[],
): RetrievedProductCandidate[] => {
  if (candidates.length === 1) {
    return candidates;
  }

  const normalizedAssistantText = normalizeTextForMatch(assistantText);
  return candidates.filter((candidate) =>
    getCandidateNames(candidate).some((candidateName) => normalizedAssistantText.includes(candidateName))
  );
};

const dedupeReferencedEntities = (entities: TurnReferencedEntity[]): TurnReferencedEntity[] => {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.entityKind}:${entity.entityId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const getCurrentFocusReferencedEntities = (
  canonicalState: CanonicalConversationStateDto | null,
): TurnReferencedEntity[] => {
  const currentFocus = canonicalState?.currentFocus;
  if (!currentFocus || currentFocus.kind === "none" || currentFocus.kind === "catalog_slice") {
    return [];
  }

  const entityKind: Extract<CanonicalConversationPresentableKind, "category" | "product" | "variant"> =
    currentFocus.kind;
  const confidence = currentFocus.entityIds.length === 1 ? "high" : "medium";
  return currentFocus.entityIds.map((entityId) => ({
    entityKind,
    entityId,
    source: "current_focus",
    confidence,
  }));
};

const toPresentedList = (
  candidates: RetrievedProductCandidate[],
): CanonicalConversationPresentedListDto | undefined => {
  if (candidates.length <= 1) {
    return undefined;
  }

  return {
    kind: "product",
    items: candidates.map((candidate, index) => ({
      displayIndex: index + 1,
      entityKind: "product",
      entityId: candidate.product.id,
      score: candidate.score,
    })),
  };
};

const getFocusKindFromReferencedEntities = (
  referencedEntities: TurnReferencedEntity[],
): CanonicalConversationFocusKind | undefined => {
  if (referencedEntities.length === 0) {
    return undefined;
  }

  const [firstKind] = referencedEntities;
  if (referencedEntities.every((entity) => entity.entityKind === firstKind?.entityKind)) {
    return firstKind?.entityKind;
  }

  return undefined;
};

const getNormalizedAction = (
  input: Pick<BuildAssistantSemanticRecordInput, "assistantText" | "chatResponse">,
  presentedList: CanonicalConversationPresentedListDto | undefined,
): PersistAssistantSemanticRecordInput["normalizedAction"] => {
  if (input.chatResponse.assistant.action.type === "handoff") {
    return "handoff";
  }

  if (input.chatResponse.assistant.action.type === "clarify") {
    return "clarify";
  }

  if (presentedList) {
    return "present_list";
  }

  if (
    input.chatResponse.outcome === "no_hits_fallback"
    || input.chatResponse.outcome === "low_signal_fallback"
    || input.chatResponse.outcome === "provider_failure_fallback"
    || input.chatResponse.outcome === "invalid_model_output_fallback"
  ) {
    return "fallback";
  }

  return "answer";
};

const getResponseMode = (
  chatResponse: CatalogChatResult,
): PersistAssistantSemanticRecordInput["responseMode"] => {
  if (chatResponse.assistant.action.type === "handoff") {
    return "handoff";
  }

  if (chatResponse.assistant.action.type === "clarify" || chatResponse.outcome === "empty_query_fallback") {
    return "clarified";
  }

  if (chatResponse.outcome === "no_hits_fallback" || chatResponse.outcome === "low_signal_fallback") {
    return "fallback";
  }

  if (chatResponse.retrieval.outcome === "grounded") {
    return "grounded";
  }

  return "inferred";
};

export const buildAssistantSemanticRecordInput = (
  input: BuildAssistantSemanticRecordInput,
): PersistAssistantSemanticRecordInput => {
  const retrievalQuery = input.chatResponse.retrieval.query.trim();
  const groundedCandidates = input.chatResponse.retrieval.outcome === "grounded"
    ? input.chatResponse.retrieval.candidates
    : [];
  const shownGroundedCandidates = selectGroundedCandidatesShownInAssistantText(
    input.assistantText,
    groundedCandidates,
  );
  const presentedList = toPresentedList(shownGroundedCandidates);
  const groundedReferencedEntities: TurnReferencedEntity[] = shownGroundedCandidates.map((candidate, index, array) => ({
    entityKind: "product",
    entityId: candidate.product.id,
    source: "raw_text",
    confidence: array.length === 1 ? "high" : "medium",
  }));
  const currentFocusFallbackEntities = groundedReferencedEntities.length > 0
    ? []
    : getCurrentFocusReferencedEntities(input.canonicalState);
  const referencedEntities = dedupeReferencedEntities([
    ...groundedReferencedEntities,
    ...currentFocusFallbackEntities,
  ]);
  const focusKind = getFocusKindFromReferencedEntities(referencedEntities);

  return {
    companyId: input.companyId,
    conversationId: input.conversationId,
    assistantMessageId: input.assistantMessageId,
    schemaVersion: "v1",
    actionType: input.chatResponse.assistant.action.type,
    normalizedAction: getNormalizedAction(input, presentedList),
    semanticRecordStatus: "complete",
    presentedNumberedList: Boolean(presentedList) && hasNumberedListFormatting(input.assistantText),
    orderedPresentedEntityIds: presentedList ? presentedList.items.map((item) => item.entityId) : [],
    displayIndexToEntityIdMap: presentedList
      ? presentedList.items.map((item) => ({
        displayIndex: item.displayIndex,
        entityId: item.entityId,
      }))
      : [],
    ...(presentedList ? { presentedList } : {}),
    referencedEntities,
    ...(retrievalQuery.length > 0
      ? {
        resolvedStandaloneQueryUsed: {
          text: retrievalQuery,
          status: "used" as const,
        },
      }
      : {}),
    responseLanguage: input.chatResponse.language.responseLanguage,
    responseMode: getResponseMode(input.chatResponse),
    groundingSourceMetadata: {
      usedRetrieval: input.chatResponse.retrieval.outcome === "grounded",
      usedConversationState: currentFocusFallbackEntities.length > 0,
      usedSummary: false,
      ...(retrievalQuery.length > 0 ? { retrievalMode: "raw_latest_message" as const } : {}),
      groundedEntityIds: shownGroundedCandidates.map((candidate) => candidate.product.id),
    },
    ...((input.chatResponse.outcome === "provider_failure_fallback" || input.chatResponse.outcome === "invalid_model_output_fallback")
      ? {
        handoffRationale: {
          reasonCode: input.chatResponse.outcome === "provider_failure_fallback"
            ? "provider_failure"
            : "invalid_model_output",
        },
      }
      : {}),
    ...(input.chatResponse.assistant.action.type === "clarify"
      ? {
        clarificationRationale: {
          reasonCode: input.chatResponse.outcome === "empty_query_fallback" ? "empty_query" : "assistant_action",
        },
      }
      : {}),
    stateMutationHints: {
      ...(focusKind ? { focusKind } : {}),
      focusEntityIds: referencedEntities.map((entity) => entity.entityId),
      shouldSetPendingClarification: input.chatResponse.assistant.action.type === "clarify",
      ...(retrievalQuery.length > 0 ? { latestStandaloneQueryText: retrievalQuery } : {}),
      ...(presentedList ? { lastPresentedList: presentedList } : {}),
    },
    createdAt: input.createdAt,
  };
};

export const toAssistantSemanticRecordForResolution = (
  record: AssistantSemanticRecordDto,
): AssistantSemanticRecordForResolution => ({
  semanticRecordId: record.id,
  assistantMessageId: record.assistantMessageId,
  actionType: record.actionType,
  ...(record.responseLanguage ? { responseLanguage: record.responseLanguage } : {}),
  responseMode: record.responseMode,
  orderedPresentedEntityIds: record.orderedPresentedEntityIds,
  ...(record.presentedList ? { presentedList: record.presentedList } : {}),
  referencedEntities: record.referencedEntities,
  ...(record.resolvedStandaloneQueryUsed ? { resolvedStandaloneQueryUsed: record.resolvedStandaloneQueryUsed } : {}),
  createdAt: record.createdAt,
});
