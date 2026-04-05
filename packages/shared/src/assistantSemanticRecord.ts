import type {
  CanonicalConversationFocusKind,
  CanonicalConversationPresentedListDto,
} from "./conversationState";
import type { RetrievalMode } from "./conversationalIntelligenceDiagnostics";
import type { TurnReferencedEntity } from "./turnResolution";

export const ASSISTANT_SEMANTIC_NORMALIZED_ACTION_VALUES = [
  "answer",
  "present_list",
  "clarify",
  "handoff",
  "fallback",
] as const;

export type AssistantSemanticNormalizedAction =
  (typeof ASSISTANT_SEMANTIC_NORMALIZED_ACTION_VALUES)[number];

export const ASSISTANT_SEMANTIC_RECORD_STATUS_VALUES = [
  "complete",
  "partial",
  "unavailable",
  "skipped",
] as const;

export type AssistantSemanticRecordStatus =
  (typeof ASSISTANT_SEMANTIC_RECORD_STATUS_VALUES)[number];

export const ASSISTANT_SEMANTIC_RESPONSE_MODE_VALUES = [
  "grounded",
  "inferred",
  "clarified",
  "fallback",
  "handoff",
] as const;

export type AssistantSemanticResponseMode =
  (typeof ASSISTANT_SEMANTIC_RESPONSE_MODE_VALUES)[number];

export interface AssistantSemanticDisplayIndexMappingDto {
  displayIndex: number;
  entityId: string;
}

export interface AssistantSemanticResolvedStandaloneQueryDto {
  text: string;
  status: "used" | "not_used";
}

export interface AssistantSemanticGroundingSourceMetadataDto {
  usedRetrieval: boolean;
  usedConversationState: boolean;
  usedSummary: boolean;
  retrievalMode?: RetrievalMode;
  groundedEntityIds: string[];
}

export interface AssistantSemanticRationaleDto {
  reasonCode: string;
  detail?: string;
}

export interface AssistantSemanticStateMutationHintsDto {
  focusKind?: CanonicalConversationFocusKind;
  focusEntityIds: string[];
  shouldSetPendingClarification: boolean;
  latestStandaloneQueryText?: string;
  lastPresentedList?: CanonicalConversationPresentedListDto;
}

export interface AssistantSemanticRecordDto {
  id: string;
  schemaVersion: "v1";
  companyId: string;
  conversationId: string;
  assistantMessageId: string;
  actionType: "none" | "clarify" | "handoff";
  normalizedAction: AssistantSemanticNormalizedAction;
  semanticRecordStatus: AssistantSemanticRecordStatus;
  presentedNumberedList: boolean;
  orderedPresentedEntityIds: string[];
  displayIndexToEntityIdMap: AssistantSemanticDisplayIndexMappingDto[];
  presentedList?: CanonicalConversationPresentedListDto;
  referencedEntities: TurnReferencedEntity[];
  resolvedStandaloneQueryUsed?: AssistantSemanticResolvedStandaloneQueryDto;
  responseLanguage?: "ar" | "en";
  responseMode: AssistantSemanticResponseMode;
  groundingSourceMetadata: AssistantSemanticGroundingSourceMetadataDto;
  handoffRationale?: AssistantSemanticRationaleDto;
  clarificationRationale?: AssistantSemanticRationaleDto;
  stateMutationHints: AssistantSemanticStateMutationHintsDto;
  createdAt: number;
}
