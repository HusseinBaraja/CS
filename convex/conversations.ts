import { v } from 'convex/values';
import type { PromptHistoryTurn } from '@cs/ai/chat/promptContracts';
import type {
  AssistantSemanticRecordDto,
  CanonicalConversationFocusDto,
  CanonicalConversationFocusKind,
  CanonicalConversationHeuristicCandidateDto,
  CanonicalConversationPresentedListDto,
  CanonicalConversationStateDto,
  CanonicalConversationStateReadResultDto,
  ConversationMessageDto,
  ConversationRecordDto,
  ConversationSummaryDto,
  ConversationLifecycleEventSource,
  ConversationLifecycleEventType,
  PromptHistorySelection,
  PromptHistorySelectionMode,
  RetrievalOutcome,
  TurnReferencedEntity,
  TurnResolutionQuotedReference,
} from '@cs/shared';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  type ActionCtx,
  type DatabaseReader,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';

const CONVERSATION_LOCK_LEASE_MS = 15_000;
const CONVERSATION_LOCK_POLL_MS = 100;
const MAX_CONVERSATION_LOCK_WAIT_MS = 1_500;
const TRIM_MESSAGES_BATCH_SIZE = 100;
const LIST_CONVERSATION_MESSAGES_BATCH_SIZE = 100;
export const AUTO_RESUME_IDLE_MS = 12 * 60 * 60 * 1_000;
export const STALE_CONTEXT_RESET_MS = 30 * 60 * 1_000;
const REFERENCED_HISTORY_SIDE_MESSAGES = 5;
const MAX_CANONICAL_STATE_CANDIDATES = 5;
const CANONICAL_STATE_SCHEMA_VERSION = "v1";
const ASSISTANT_SEMANTIC_RECORD_SCHEMA_VERSION = "v1";

type LockAcquireResult = {
  acquired: boolean;
  waitMs: number;
};

type TrimConversationMessagesResult = {
  deletedCount: number;
  remainingCount: number;
};

type AppendInboundCustomerMessageResult = {
  conversation: ConversationRecordDto;
  wasMuted: boolean;
  wasDuplicate: boolean;
};

type AssistantHandoffSource = Extract<
  ConversationLifecycleEventSource,
  "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback"
>;

type PendingAssistantMessageCandidate = {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  companyId: Id<"companies">;
  phoneNumber: string;
  timestamp: number;
  transportMessageId?: string;
  analyticsState?: "pending" | "recorded" | "completed" | "not_applicable";
  ownerNotificationState?: "pending" | "sent" | "completed" | "not_applicable";
};

type CanonicalConversationStateMutationCandidate = {
  entityKind: Exclude<CanonicalConversationFocusKind, "none" | "catalog_slice">;
  entityId: string;
  score: number;
};

type CanonicalConversationTurnOutcomeInput = {
  companyId: Id<"companies">;
  conversationId: Id<"conversations">;
  responseLanguage?: "ar" | "en";
  latestUserMessageText: string;
  assistantActionType: "none" | "clarify" | "handoff";
  committedAssistantTimestamp: number;
  promptHistorySelectionMode: PromptHistorySelectionMode;
  usedQuotedReference: boolean;
  referencedTransportMessageId?: string;
  retrievalOutcome: RetrievalOutcome;
  candidates: CanonicalConversationStateMutationCandidate[];
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const getConversationLockKey = (companyId: Id<"companies">, phoneNumber: string): string =>
  `conversation:${companyId}:${phoneNumber}`;

const normalizePhoneNumber = (phoneNumber: string): string => {
  const normalized = phoneNumber.trim();
  if (normalized.length === 0) {
    throw new Error("phoneNumber is required");
  }

  return normalized;
};

const normalizeTimestamp = (timestamp: number | undefined, fallback: number): number => {
  const candidate = timestamp ?? fallback;
  if (!Number.isFinite(candidate)) {
    throw new Error("timestamp must be a finite number");
  }

  return Math.trunc(candidate);
};

const normalizePositiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return normalized;
};

const normalizeOptionalLimit = (limit: number | undefined): number | undefined =>
  limit === undefined ? undefined : normalizePositiveInteger(limit, "limit");

const normalizeMessageContent = (content: string): string => {
  const normalized = content.trim();
  if (normalized.length === 0) {
    throw new Error("content must be a non-empty string");
  }

  return normalized;
};

const normalizeOptionalMessageId = (
  value: string | undefined,
  fieldName: string,
): string | undefined => normalizeOptionalString(value, fieldName);

const resolveSideEffectsState = (
  message: Pick<Doc<"messages">, "analyticsState" | "ownerNotificationState">,
): "pending" | "completed" => {
  const analyticsComplete =
    message.analyticsState === "completed" || message.analyticsState === "not_applicable";
  const ownerNotificationComplete =
    message.ownerNotificationState === "completed" || message.ownerNotificationState === "not_applicable";

  return analyticsComplete && ownerNotificationComplete ? "completed" : "pending";
};

const toConversationDto = (conversation: Doc<"conversations">): ConversationRecordDto => ({
  id: conversation._id,
  companyId: conversation.companyId,
  phoneNumber: conversation.phoneNumber,
  muted: conversation.muted,
  ...(conversation.mutedAt !== undefined ? { mutedAt: conversation.mutedAt } : {}),
  ...(conversation.lastCustomerMessageAt !== undefined
    ? { lastCustomerMessageAt: conversation.lastCustomerMessageAt }
    : {}),
  ...(conversation.nextAutoResumeAt !== undefined ? { nextAutoResumeAt: conversation.nextAutoResumeAt } : {}),
});

const toMessageDto = (message: Doc<"messages">): ConversationMessageDto => ({
  id: message._id,
  conversationId: message.conversationId,
  role: message.role,
  content: message.content,
  timestamp: message.timestamp,
  ...(message.deliveryState !== undefined ? { deliveryState: message.deliveryState } : {}),
  ...(message.handoffSource !== undefined ? { handoffSource: message.handoffSource } : {}),
  ...(message.providerAcknowledgedAt !== undefined
    ? { providerAcknowledgedAt: message.providerAcknowledgedAt }
    : {}),
  ...(message.sideEffectsState !== undefined ? { sideEffectsState: message.sideEffectsState } : {}),
  ...(message.ownerNotificationState !== undefined
    ? { ownerNotificationState: message.ownerNotificationState }
    : {}),
  ...(message.analyticsState !== undefined ? { analyticsState: message.analyticsState } : {}),
  ...(message.transportMessageId !== undefined ? { transportMessageId: message.transportMessageId } : {}),
  ...(message.referencedTransportMessageId !== undefined
    ? { referencedTransportMessageId: message.referencedTransportMessageId }
    : {}),
});

const toPromptHistoryTurn = (message: ConversationMessageDto): PromptHistoryTurn => ({
  role: message.role,
  text: message.content,
});

const toPromptHistorySelection = (
  turns: PromptHistoryTurn[],
  selectionMode: PromptHistorySelectionMode,
): PromptHistorySelection<PromptHistoryTurn> => ({
  turns,
  selectionMode,
  usedQuotedReference: selectionMode === "quoted_reference_window",
});

const normalizeOptionalString = (value: string | undefined, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string when provided`);
  }

  return normalized;
};

const normalizeOptionalCanonicalEntityId = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
};

const normalizeCanonicalCandidateScore = (score: number): number => {
  if (!Number.isFinite(score)) {
    throw new Error("candidate scores must be finite numbers");
  }

  return score;
};

const createEmptyCanonicalConversationFocus = (): CanonicalConversationFocusDto => ({
  kind: "none",
  entityIds: [],
});

const createSeedCanonicalConversationState = (
  companyId: Id<"companies">,
  conversationId: Id<"conversations">,
): CanonicalConversationStateDto => ({
  schemaVersion: CANONICAL_STATE_SCHEMA_VERSION,
  conversationId,
  companyId,
  currentFocus: createEmptyCanonicalConversationFocus(),
  pendingClarification: {
    active: false,
  },
  freshness: {
    status: "stale",
  },
  sourceOfTruthMarkers: {},
  heuristicHints: {
    usedQuotedReference: false,
    topCandidates: [],
  },
});

const toCanonicalConversationStateDto = (
  state: Doc<"conversationCanonicalStates">,
): CanonicalConversationStateDto => ({
  schemaVersion: state.schemaVersion,
  conversationId: state.conversationId,
  companyId: state.companyId,
  ...(state.responseLanguage ? { responseLanguage: state.responseLanguage } : {}),
  currentFocus: state.currentFocus,
  ...(state.lastPresentedList ? { lastPresentedList: state.lastPresentedList } : {}),
  pendingClarification: state.pendingClarification,
  ...(state.latestStandaloneQuery ? { latestStandaloneQuery: state.latestStandaloneQuery } : {}),
  freshness: state.freshness,
  sourceOfTruthMarkers: state.sourceOfTruthMarkers,
  heuristicHints: state.heuristicHints,
});

const toCanonicalStateReadResult = (
  state: CanonicalConversationStateDto,
  invalidatedPaths: string[],
): CanonicalConversationStateReadResultDto => ({
  state,
  invalidatedPaths,
});

const sanitizeNonEmptyStringArray = (values: string[]): string[] =>
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const toAssistantSemanticRecordDto = (
  record: Doc<"assistantSemanticRecords">,
): AssistantSemanticRecordDto => ({
  id: record._id,
  schemaVersion: record.schemaVersion,
  companyId: record.companyId,
  conversationId: record.conversationId,
  assistantMessageId: record.assistantMessageId,
  actionType: record.actionType,
  normalizedAction: record.normalizedAction,
  semanticRecordStatus: record.semanticRecordStatus,
  presentedNumberedList: record.presentedNumberedList,
  orderedPresentedEntityIds: [...record.orderedPresentedEntityIds],
  displayIndexToEntityIdMap: [...record.displayIndexToEntityIdMap],
  ...(record.presentedList ? { presentedList: record.presentedList } : {}),
  referencedEntities: [...record.referencedEntities],
  ...(record.resolvedStandaloneQueryUsed
    ? { resolvedStandaloneQueryUsed: record.resolvedStandaloneQueryUsed }
    : {}),
  ...(record.responseLanguage ? { responseLanguage: record.responseLanguage } : {}),
  responseMode: record.responseMode,
  groundingSourceMetadata: {
    ...record.groundingSourceMetadata,
    groundedEntityIds: [...record.groundingSourceMetadata.groundedEntityIds],
  },
  ...(record.handoffRationale ? { handoffRationale: record.handoffRationale } : {}),
  ...(record.clarificationRationale ? { clarificationRationale: record.clarificationRationale } : {}),
  stateMutationHints: {
    ...record.stateMutationHints,
    focusEntityIds: [...record.stateMutationHints.focusEntityIds],
    ...(record.stateMutationHints.lastPresentedList
      ? { lastPresentedList: record.stateMutationHints.lastPresentedList }
      : {}),
  },
  createdAt: record.createdAt,
});

const toConversationSummaryDto = (
  summary: Doc<"conversationSummaries">,
): ConversationSummaryDto => ({
  summaryId: summary.summaryId,
  conversationId: summary.conversationId,
  ...(summary.durableCustomerGoal ? { durableCustomerGoal: summary.durableCustomerGoal } : {}),
  stablePreferences: [...summary.stablePreferences],
  importantResolvedDecisions: [...summary.importantResolvedDecisions],
  historicalContextNeededForFutureTurns: [...summary.historicalContextNeededForFutureTurns],
  freshness: summary.freshness,
  provenance: summary.provenance,
  coveredMessageRange: summary.coveredMessageRange,
});

const loadCanonicalConversationStateDoc = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
): Promise<Doc<"conversationCanonicalStates"> | null> => {
  const states = await ctx.db
    .query("conversationCanonicalStates")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();

  return states[0] ?? null;
};

const loadAssistantSemanticRecordByMessageId = async (
  ctx: { db: DatabaseReader },
  assistantMessageId: Id<"messages">,
): Promise<Doc<"assistantSemanticRecords"> | null> => {
  const records = await ctx.db
    .query("assistantSemanticRecords")
    .withIndex("by_assistant_message", (q) => q.eq("assistantMessageId", assistantMessageId))
    .collect();

  return records[0] ?? null;
};

const loadConversationSummaryByConversationAndSummaryId = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  summaryId: string,
): Promise<Doc<"conversationSummaries"> | null> => {
  const summaries = await ctx.db
    .query("conversationSummaries")
    .withIndex("by_conversation_summary_id", (q) => q.eq("conversationId", conversationId).eq("summaryId", summaryId))
    .collect();

  return summaries[0] ?? null;
};

const loadLatestConversationSummaryDoc = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
): Promise<Doc<"conversationSummaries"> | null> => {
  const summaries = await ctx.db
    .query("conversationSummaries")
    .withIndex("by_conversation_updated_at", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .take(1);

  return summaries[0] ?? null;
};

const isScopedCategoryId = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  categoryId: string,
): Promise<boolean> => {
  const normalizedId = normalizeOptionalCanonicalEntityId(categoryId);
  if (!normalizedId) {
    return false;
  }

  try {
    const category = await ctx.db.get(normalizedId as Id<"categories">);
    return Boolean(category && category.companyId === companyId);
  } catch {
    return false;
  }
};

const isScopedProductId = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  productId: string,
): Promise<boolean> => {
  const normalizedId = normalizeOptionalCanonicalEntityId(productId);
  if (!normalizedId) {
    return false;
  }

  try {
    const product = await ctx.db.get(normalizedId as Id<"products">);
    return Boolean(product && product.companyId === companyId);
  } catch {
    return false;
  }
};

const isScopedVariantId = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  variantId: string,
): Promise<boolean> => {
  const normalizedId = normalizeOptionalCanonicalEntityId(variantId);
  if (!normalizedId) {
    return false;
  }

  try {
    const variant = await ctx.db.get(normalizedId as Id<"productVariants">);
    if (!variant) {
      return false;
    }

    const product = await ctx.db.get(variant.productId);
    return Boolean(product && product.companyId === companyId);
  } catch {
    return false;
  }
};

const isValidCanonicalEntityId = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  entityKind: Exclude<CanonicalConversationFocusKind, "none" | "catalog_slice">,
  entityId: string,
): Promise<boolean> => {
  switch (entityKind) {
    case "category":
      return isScopedCategoryId(ctx, companyId, entityId);
    case "product":
      return isScopedProductId(ctx, companyId, entityId);
    case "variant":
      return isScopedVariantId(ctx, companyId, entityId);
  }
};

const sanitizeTurnReferencedEntities = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  referencedEntities: TurnReferencedEntity[],
): Promise<TurnReferencedEntity[]> => {
  const sanitized: TurnReferencedEntity[] = [];

  for (const entity of referencedEntities) {
    if (await isValidCanonicalEntityId(ctx, companyId, entity.entityKind, entity.entityId)) {
      sanitized.push(entity);
    }
  }

  return sanitized;
};

const sanitizeAssistantSemanticStateMutationHints = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  hints: AssistantSemanticRecordDto["stateMutationHints"],
): Promise<AssistantSemanticRecordDto["stateMutationHints"]> => {
  const focusEntityIds = sanitizeNonEmptyStringArray(hints.focusEntityIds);
  let sanitizedFocusEntityIds = focusEntityIds;

  if (hints.focusKind && hints.focusKind !== "catalog_slice" && hints.focusKind !== "none") {
    sanitizedFocusEntityIds = [];
    for (const entityId of focusEntityIds) {
      if (await isValidCanonicalEntityId(ctx, companyId, hints.focusKind, entityId)) {
        sanitizedFocusEntityIds.push(entityId);
      }
    }
  }

  const sanitizedList = hints.lastPresentedList
    ? await sanitizeCanonicalPresentedList(ctx, companyId, hints.lastPresentedList, "stateMutationHints.lastPresentedList")
    : { list: undefined, invalidatedPaths: [] as string[] };

  return {
    ...(hints.focusKind ? { focusKind: hints.focusKind } : {}),
    focusEntityIds: sanitizedFocusEntityIds,
    shouldSetPendingClarification: hints.shouldSetPendingClarification,
    ...(hints.latestStandaloneQueryText
      ? { latestStandaloneQueryText: hints.latestStandaloneQueryText.trim() }
      : {}),
    ...(sanitizedList.list ? { lastPresentedList: sanitizedList.list } : {}),
  };
};

const sanitizeAssistantSemanticRecordDto = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  record: AssistantSemanticRecordDto,
): Promise<AssistantSemanticRecordDto> => {
  const { presentedList: _presentedList, ...restRecord } = record;
  const sanitizedPresentedList = record.presentedList
    ? await sanitizeCanonicalPresentedList(ctx, companyId, record.presentedList, "presentedList")
    : { list: undefined, invalidatedPaths: [] as string[] };
  const referencedEntities = await sanitizeTurnReferencedEntities(ctx, companyId, record.referencedEntities);
  const orderedPresentedEntityIds = sanitizedPresentedList.list
    ? sanitizedPresentedList.list.items
      .slice()
      .sort((left, right) => left.displayIndex - right.displayIndex)
      .map((item) => item.entityId)
    : record.presentedList
      ? []
    : sanitizeNonEmptyStringArray(record.orderedPresentedEntityIds);
  const displayIndexToEntityIdMap = sanitizedPresentedList.list
    ? sanitizedPresentedList.list.items
      .slice()
      .sort((left, right) => left.displayIndex - right.displayIndex)
      .map((item) => ({
        displayIndex: item.displayIndex,
        entityId: item.entityId,
      }))
    : record.presentedList
      ? []
    : record.displayIndexToEntityIdMap
      .map((item) => ({
        displayIndex: Math.trunc(item.displayIndex),
        entityId: item.entityId.trim(),
      }))
      .filter((item) => item.displayIndex > 0 && item.entityId.length > 0);
  const groundedEntityIds = sanitizeNonEmptyStringArray(record.groundingSourceMetadata.groundedEntityIds);

  return {
    ...restRecord,
    orderedPresentedEntityIds,
    displayIndexToEntityIdMap,
    ...(sanitizedPresentedList.list ? { presentedList: sanitizedPresentedList.list } : {}),
    referencedEntities,
    groundingSourceMetadata: {
      ...record.groundingSourceMetadata,
      groundedEntityIds,
    },
    stateMutationHints: await sanitizeAssistantSemanticStateMutationHints(
      ctx,
      companyId,
      record.stateMutationHints,
    ),
  };
};

const sanitizeCanonicalFocus = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  focus: CanonicalConversationFocusDto,
  path: string,
): Promise<{ focus: CanonicalConversationFocusDto; invalidatedPaths: string[] }> => {
  if (focus.kind === "none") {
    return { focus, invalidatedPaths: [] };
  }

  if (focus.kind === "catalog_slice") {
    return {
      focus,
      invalidatedPaths: focus.entityIds.every((entityId) => normalizeOptionalCanonicalEntityId(entityId))
        ? []
        : [path],
    };
  }

  const validEntityIds: string[] = [];
  for (const entityId of focus.entityIds) {
    if (await isValidCanonicalEntityId(ctx, companyId, focus.kind, entityId)) {
      validEntityIds.push(entityId);
    }
  }

  if (validEntityIds.length === focus.entityIds.length) {
    return { focus, invalidatedPaths: [] };
  }

  if (validEntityIds.length === 0) {
    return {
      focus: createEmptyCanonicalConversationFocus(),
      invalidatedPaths: [path],
    };
  }

  return {
    focus: {
      ...focus,
      entityIds: validEntityIds,
    },
    invalidatedPaths: [`${path}.entityIds`],
  };
};

const sanitizeCanonicalPresentedList = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  list: CanonicalConversationPresentedListDto | undefined,
  path: string,
): Promise<{ list: CanonicalConversationPresentedListDto | undefined; invalidatedPaths: string[] }> => {
  if (!list) {
    return { list: undefined, invalidatedPaths: [] };
  }

  if (list.kind === "catalog_slice") {
    return {
      list,
      invalidatedPaths: list.items.every((item) => normalizeOptionalCanonicalEntityId(item.entityId))
        ? []
        : [path],
    };
  }

  const items = [];
  for (const item of list.items) {
    if (item.entityKind === "catalog_slice") {
      if (normalizeOptionalCanonicalEntityId(item.entityId)) {
        items.push(item);
      }
      continue;
    }

    const isValid = await isValidCanonicalEntityId(ctx, companyId, item.entityKind, item.entityId);
    if (isValid) {
      items.push(item);
    }
  }

  if (items.length === list.items.length) {
    return { list, invalidatedPaths: [] };
  }

  if (items.length === 0) {
    return { list: undefined, invalidatedPaths: [path] };
  }

  return {
    list: {
      ...list,
      items,
    },
    invalidatedPaths: [`${path}.items`],
  };
};

const sanitizeCanonicalHeuristicCandidates = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  candidates: CanonicalConversationHeuristicCandidateDto[],
  path: string,
): Promise<{ candidates: CanonicalConversationHeuristicCandidateDto[]; invalidatedPaths: string[] }> => {
  const validCandidates: CanonicalConversationHeuristicCandidateDto[] = [];

  for (const candidate of candidates) {
    if (await isValidCanonicalEntityId(ctx, companyId, candidate.entityKind, candidate.entityId)) {
      validCandidates.push(candidate);
    }
  }

  return {
    candidates: validCandidates,
    invalidatedPaths: validCandidates.length === candidates.length ? [] : [path],
  };
};

const applyFreshnessStatus = (
  freshness: CanonicalConversationStateDto["freshness"],
  now: number,
): CanonicalConversationStateDto["freshness"] => ({
  ...freshness,
  status:
    freshness.activeWindowExpiresAt !== undefined && freshness.activeWindowExpiresAt >= now
      ? "fresh"
      : "stale",
});

const sanitizeCanonicalConversationState = async (
  ctx: { db: DatabaseReader },
  input: {
    companyId: Id<"companies">;
    state: CanonicalConversationStateDto;
    now: number;
  },
): Promise<CanonicalConversationStateReadResultDto> => {
  const invalidatedPaths: string[] = [];
  const currentFocus = await sanitizeCanonicalFocus(ctx, input.companyId, input.state.currentFocus, "currentFocus");
  invalidatedPaths.push(...currentFocus.invalidatedPaths);
  const lastPresentedList = await sanitizeCanonicalPresentedList(
    ctx,
    input.companyId,
    input.state.lastPresentedList,
    "lastPresentedList",
  );
  invalidatedPaths.push(...lastPresentedList.invalidatedPaths);
  const retrievalOrderListProxy = await sanitizeCanonicalPresentedList(
    ctx,
    input.companyId,
    input.state.heuristicHints.retrievalOrderListProxy,
    "heuristicHints.retrievalOrderListProxy",
  );
  invalidatedPaths.push(...retrievalOrderListProxy.invalidatedPaths);
  const heuristicFocus = input.state.heuristicHints.heuristicFocus
    ? await sanitizeCanonicalFocus(ctx, input.companyId, input.state.heuristicHints.heuristicFocus, "heuristicHints.heuristicFocus")
    : { focus: undefined, invalidatedPaths: [] as string[] };
  invalidatedPaths.push(...heuristicFocus.invalidatedPaths);
  const topCandidates = await sanitizeCanonicalHeuristicCandidates(
    ctx,
    input.companyId,
    input.state.heuristicHints.topCandidates,
    "heuristicHints.topCandidates",
  );
  invalidatedPaths.push(...topCandidates.invalidatedPaths);

  return toCanonicalStateReadResult({
    ...input.state,
    currentFocus: currentFocus.focus,
    ...(lastPresentedList.list ? { lastPresentedList: lastPresentedList.list } : {}),
    freshness: applyFreshnessStatus(input.state.freshness, input.now),
    heuristicHints: {
      ...input.state.heuristicHints,
      topCandidates: topCandidates.candidates,
      ...(retrievalOrderListProxy.list ? { retrievalOrderListProxy: retrievalOrderListProxy.list } : {}),
      ...(heuristicFocus.focus ? { heuristicFocus: heuristicFocus.focus } : {}),
    },
  }, invalidatedPaths);
};

const normalizeCanonicalCandidates = (
  candidates: CanonicalConversationTurnOutcomeInput["candidates"],
): CanonicalConversationHeuristicCandidateDto[] =>
  candidates
    .slice(0, MAX_CANONICAL_STATE_CANDIDATES)
    .map((candidate) => ({
      entityKind: candidate.entityKind,
      entityId: normalizeOptionalCanonicalEntityId(candidate.entityId) ?? candidate.entityId.trim(),
      score: normalizeCanonicalCandidateScore(candidate.score),
    }))
    .filter((candidate) => candidate.entityId.length > 0);

const buildCanonicalHeuristicFocus = (
  candidates: CanonicalConversationHeuristicCandidateDto[],
  updatedAt: number,
): CanonicalConversationFocusDto | undefined => {
  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    return undefined;
  }

  return {
    kind: firstCandidate.entityKind,
    entityIds: [firstCandidate.entityId],
    source: "heuristic",
    updatedAt,
  };
};

const buildCanonicalRetrievalOrderListProxy = (
  candidates: CanonicalConversationHeuristicCandidateDto[],
  updatedAt: number,
): CanonicalConversationPresentedListDto | undefined => {
  if (candidates.length <= 1) {
    return undefined;
  }

  const firstCandidate = candidates[0]!;

  return {
    kind: firstCandidate.entityKind,
    items: candidates.map((candidate, index) => ({
      displayIndex: index + 1,
      entityKind: candidate.entityKind,
      entityId: candidate.entityId,
      score: candidate.score,
    })),
    source: "heuristic",
    updatedAt,
  };
};

const isVisibleConversationMessage = (
  message: Pick<Doc<"messages">, "role" | "deliveryState">,
): boolean => message.role === "user" || message.deliveryState === "sent";

const listConversationMessageDocsDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
) =>
  ctx.db
    .query("messages")
    .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .collect();

const listConversationMessageDocsPageDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  input: {
    cursor: string | null;
    limit: number;
  },
) =>
  ctx.db
    .query("messages")
    .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .paginate({
      cursor: input.cursor,
      numItems: input.limit,
    });

const listVisibleConversationMessagesDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  limit: number,
): Promise<Array<Doc<"messages">>> => {
  const visibleMessages: Array<Doc<"messages">> = [];
  let cursor: string | null = null;
  const batchSize = Math.max(limit, LIST_CONVERSATION_MESSAGES_BATCH_SIZE);

  while (visibleMessages.length < limit) {
    const page = await listConversationMessageDocsPageDescending(ctx, conversationId, {
      cursor,
      limit: batchSize,
    });

    const remaining = limit - visibleMessages.length;
    visibleMessages.push(...page.page.filter(isVisibleConversationMessage).slice(0, remaining));
    if (visibleMessages.length >= limit) {
      break;
    }

    if (page.isDone || page.continueCursor === cursor || page.page.length === 0) {
      break;
    }

    cursor = page.continueCursor;
  }

  return visibleMessages;
};

const resolveMessageByTransportMessageId = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  transportMessageId: string,
): Promise<Doc<"messages"> | null> => {
  const normalizedTransportMessageId = normalizeOptionalMessageId(transportMessageId, "transportMessageId");
  if (!normalizedTransportMessageId) {
    return null;
  }

  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_transport_message_id", (q) =>
      q.eq("conversationId", conversationId).eq("transportMessageId", normalizedTransportMessageId)
    )
    .collect();

  return messages[0] ?? null;
};

const resolveExistingMessageInsert = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  transportMessageId: string | undefined,
): Promise<Doc<"messages"> | null> => {
  if (!transportMessageId) {
    return null;
  }

  return resolveMessageByTransportMessageId(ctx, conversationId, transportMessageId);
};

const isMessageBeforeInbound = (
  message: ConversationMessageDto,
  input: {
    inboundTimestamp: number;
    currentTransportMessageId?: string;
  },
): boolean =>
  isVisibleConversationMessage(message)
  && (
    message.timestamp < input.inboundTimestamp
    || (
      message.timestamp === input.inboundTimestamp
      && message.transportMessageId !== input.currentTransportMessageId
    )
  );

const iterateConversationMessagesDescending = (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
) =>
  ctx.db
    .query("messages")
    .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
    .order("desc");

const iterateConversationMessagesAscending = (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
) =>
  ctx.db
    .query("messages")
    .withIndex("by_conversation_time", (q) => q.eq("conversationId", conversationId))
    .order("asc");

const collectPriorMessagesDescending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  input: {
    inboundTimestamp: number;
    currentTransportMessageId?: string;
    minimumCount?: number;
    stopWhenPriorMessagesFound?: boolean;
  },
): Promise<ConversationMessageDto[]> => {
  const priorMessages: ConversationMessageDto[] = [];

  for await (const messageDoc of iterateConversationMessagesDescending(ctx, conversationId)) {
    const message = toMessageDto(messageDoc);
    if (!isMessageBeforeInbound(message, input)) {
      continue;
    }

    priorMessages.push(message);

    if (input.stopWhenPriorMessagesFound) {
      return priorMessages;
    }

    if (
      input.minimumCount !== undefined
      && priorMessages.length >= input.minimumCount
    ) {
      return priorMessages;
    }
  }

  return priorMessages;
};

const collectReferencedHistorySliceAscending = async (
  ctx: { db: DatabaseReader },
  conversationId: Id<"conversations">,
  input: {
    inboundTimestamp: number;
    currentTransportMessageId?: string;
    referencedMessageId: Id<"messages">;
  },
): Promise<ConversationMessageDto[]> => {
  const precedingMessages: ConversationMessageDto[] = [];
  const referencedWindow: ConversationMessageDto[] = [];
  let foundReferencedMessage = false;

  for await (const messageDoc of iterateConversationMessagesAscending(ctx, conversationId)) {
    const message = toMessageDto(messageDoc);
    if (!isMessageBeforeInbound(message, input)) {
      continue;
    }

    if (!foundReferencedMessage) {
      if (message.id === input.referencedMessageId) {
        foundReferencedMessage = true;
        referencedWindow.push(...precedingMessages, message);
        continue;
      }

      precedingMessages.push(message);
      if (precedingMessages.length > REFERENCED_HISTORY_SIDE_MESSAGES) {
        precedingMessages.shift();
      }
      continue;
    }

    referencedWindow.push(message);
    if (referencedWindow.length >= (REFERENCED_HISTORY_SIDE_MESSAGES * 2) + 1) {
      return referencedWindow;
    }
  }

  return foundReferencedMessage ? referencedWindow : [];
};

const listConversationsByPhone = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  phoneNumber: string,
): Promise<Array<Doc<"conversations">>> => {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_company_phone", (q) => q.eq("companyId", companyId).eq("phoneNumber", phoneNumber))
    .collect();

  return conversations.sort((left, right) => left._creationTime - right._creationTime || left._id.localeCompare(right._id));
};

const loadMessageOrThrow = async (
  ctx: { db: DatabaseReader },
  messageId: Id<"messages">,
): Promise<Doc<"messages">> => {
  const message = await ctx.db.get(messageId);
  if (!message) {
    throw new Error("Message not found");
  }

  return message;
};

const normalizeOptionalHandoffSource = (
  value: AssistantHandoffSource | undefined,
): AssistantHandoffSource | undefined => value;

const applyAssistantHandoffIfNeeded = async (
  ctx: MutationCtx,
  input: {
    companyId: Id<"companies">;
    conversation: Doc<"conversations">;
    message: Doc<"messages">;
  },
): Promise<void> => {
  const source = input.message.handoffSource;
  if (!source || input.conversation.muted) {
    return;
  }

  await ctx.db.patch(input.conversation._id, {
    muted: true,
    mutedAt: input.message.timestamp,
    handoffSeedTimestamp: input.message.timestamp,
    nextAutoResumeAt: input.message.timestamp + AUTO_RESUME_IDLE_MS,
  });

  await insertConversationStateEvent(ctx, {
    companyId: input.companyId,
    conversationId: input.conversation._id,
    phoneNumber: input.conversation.phoneNumber,
    eventType: "handoff_started",
    timestamp: input.message.timestamp,
    source,
    ...(input.message.handoffReason ? { reason: input.message.handoffReason } : {}),
    ...(input.message.handoffActorPhoneNumber ? { actorPhoneNumber: input.message.handoffActorPhoneNumber } : {}),
    ...(input.message.handoffMetadata ? { metadata: input.message.handoffMetadata } : {}),
  });
};

const listActiveConversations = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  phoneNumber: string,
): Promise<Array<Doc<"conversations">>> => {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_company_phone_and_muted", (q) =>
      q.eq("companyId", companyId).eq("phoneNumber", phoneNumber).eq("muted", false)
    )
    .collect();

  return conversations.sort((left, right) => left._creationTime - right._creationTime || left._id.localeCompare(right._id));
};

const loadConversationByPhone = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  phoneNumber: string,
): Promise<Doc<"conversations"> | null> => {
  const conversations = await listConversationsByPhone(ctx, companyId, phoneNumber);
  return conversations[0] ?? null;
};

const loadConversationOrThrow = async (
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
  conversationId: Id<"conversations">,
): Promise<Doc<"conversations">> => {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.companyId !== companyId) {
    throw new Error("Conversation not found for company");
  }

  return conversation;
};

const insertConversationStateEvent = async (
  ctx: MutationCtx,
  input: {
    companyId: Id<"companies">;
    conversationId: Id<"conversations">;
    phoneNumber: string;
    eventType: ConversationLifecycleEventType;
    timestamp: number;
    source: ConversationLifecycleEventSource;
    reason?: string;
    actorPhoneNumber?: string;
    metadata?: Record<string, string | number | boolean>;
  },
): Promise<void> => {
  await ctx.db.insert("conversationStateEvents", {
    companyId: input.companyId,
    conversationId: input.conversationId,
    phoneNumber: input.phoneNumber,
    eventType: input.eventType,
    timestamp: input.timestamp,
    source: input.source,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.actorPhoneNumber ? { actorPhoneNumber: input.actorPhoneNumber } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
};

const loadConversationLock = async (
  ctx: MutationCtx,
  key: string,
): Promise<Doc<"jobLocks"> | null> => {
  const locks = await ctx.db
    .query("jobLocks")
    .withIndex("by_key", (q) => q.eq("key", key))
    .collect();

  if (locks.length > 1) {
    throw new Error(`Expected at most one ${key} lock, found ${locks.length}`);
  }

  return locks[0] ?? null;
};

const extendConversationLock = async (
  ctx: MutationCtx,
  lockId: Id<"jobLocks">,
  ownerToken: string,
  now: number,
): Promise<void> => {
  await ctx.db.patch(lockId, {
    ownerToken,
    acquiredAt: now,
    expiresAt: now + CONVERSATION_LOCK_LEASE_MS,
  });
};

const withConversationLock = async <T>(
  ctx: ActionCtx,
  input: {
    companyId: Id<"companies">;
    phoneNumber: string;
    now?: number;
  },
  work: () => Promise<T>,
): Promise<T> => {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const ownerToken = crypto.randomUUID();
  const key = getConversationLockKey(input.companyId, phoneNumber);
  const startedAt = normalizeTimestamp(input.now, Date.now());
  const deadline = startedAt + MAX_CONVERSATION_LOCK_WAIT_MS;
  let currentNow = startedAt;

  for (;;) {
    const acquisitionNow =
      input.now === undefined ? normalizeTimestamp(undefined, Date.now()) : currentNow;
    const acquisition = await ctx.runMutation(internal.conversations.acquireConversationLock, {
      key,
      now: acquisitionNow,
      ownerToken,
    });

    if (acquisition.acquired) {
      break;
    }

    const sleepMs = Math.min(acquisition.waitMs, CONVERSATION_LOCK_POLL_MS);
    const deadlineNow =
      input.now === undefined ? normalizeTimestamp(undefined, Date.now()) : currentNow;
    if (deadlineNow + sleepMs > deadline) {
      throw new Error(
        `Timeout acquiring conversation lock for companyId=${input.companyId} phoneNumber=${phoneNumber}`,
      );
    }

    if (input.now !== undefined) {
      currentNow += sleepMs;
    }
    await sleep(sleepMs);
  }

  try {
    return await work();
  } finally {
    await ctx.runMutation(internal.conversations.releaseConversationLock, {
      key,
      ownerToken,
    });
  }
};

export const acquireConversationLock = internalMutation({
  args: {
    key: v.string(),
    now: v.number(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<LockAcquireResult> => {
    const existingLock = await loadConversationLock(ctx, args.key);
    if (!existingLock) {
      await ctx.db.insert("jobLocks", {
        key: args.key,
        ownerToken: args.ownerToken,
        acquiredAt: args.now,
        expiresAt: args.now + CONVERSATION_LOCK_LEASE_MS,
      });

      return {
        acquired: true,
        waitMs: 0,
      };
    }

    if (existingLock.ownerToken === args.ownerToken || existingLock.expiresAt <= args.now) {
      await extendConversationLock(ctx, existingLock._id, args.ownerToken, args.now);
      return {
        acquired: true,
        waitMs: 0,
      };
    }

    return {
      acquired: false,
      waitMs: Math.max(existingLock.expiresAt - args.now, CONVERSATION_LOCK_POLL_MS),
    };
  },
});

export const releaseConversationLock = internalMutation({
  args: {
    key: v.string(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existingLock = await loadConversationLock(ctx, args.key);
    if (!existingLock || existingLock.ownerToken !== args.ownerToken) {
      return;
    }

    await ctx.db.delete(existingLock._id);
  },
});

export const ensureActiveConversation = internalMutation({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    const existing = await listActiveConversations(ctx, args.companyId, phoneNumber);
    if (existing[0]) {
      return toConversationDto(existing[0]);
    }

    const conversationId = await ctx.db.insert("conversations", {
      companyId: args.companyId,
      phoneNumber,
      muted: false,
    });
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      throw new Error("Created conversation could not be loaded");
    }

    return toConversationDto(conversation);
  },
});

export const getOrCreateActiveConversation = internalAction({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    return withConversationLock(ctx, args, async () => {
      return await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });
    });
  },
});

export const getOrCreateConversationForInbound = internalAction({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    return withConversationLock(ctx, args, async () => {
      const existing = await ctx.runQuery(internal.conversations.getConversationByPhone, {
        companyId: args.companyId,
        phoneNumber,
      });
      if (existing) {
        return existing;
      }

      return await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });
    });
  },
});

export const getConversationByPhone = internalQuery({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto | null> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    const conversation = await loadConversationByPhone(ctx, args.companyId, phoneNumber);
    return conversation ? toConversationDto(conversation) : null;
  },
});

export const getConversation = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(conversation);
  },
});

export const getCanonicalConversationState = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CanonicalConversationStateReadResultDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const now = normalizeTimestamp(args.now, Date.now());
    const storedState = await loadCanonicalConversationStateDoc(ctx, args.conversationId);
    const seededState = storedState
      ? toCanonicalConversationStateDto(storedState)
      : createSeedCanonicalConversationState(args.companyId, args.conversationId);

    return sanitizeCanonicalConversationState(ctx, {
      companyId: args.companyId,
      state: seededState,
      now,
    });
  },
});

export const getQuotedReferenceContext = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    referencedTransportMessageId: v.string(),
  },
  handler: async (ctx, args): Promise<TurnResolutionQuotedReference | null> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const referencedMessage = await resolveMessageByTransportMessageId(
      ctx,
      args.conversationId,
      args.referencedTransportMessageId,
    );

    if (!referencedMessage) {
      return null;
    }

    let presentedList: CanonicalConversationPresentedListDto | undefined;
    let referencedEntities: TurnReferencedEntity[] | undefined;
    if (referencedMessage.role === "assistant") {
      const semanticRecord = await loadAssistantSemanticRecordByMessageId(ctx, referencedMessage._id);
      if (semanticRecord) {
        const sanitizedSemanticRecord = await sanitizeAssistantSemanticRecordDto(
          ctx,
          args.companyId,
          toAssistantSemanticRecordDto(semanticRecord),
        );
        presentedList = sanitizedSemanticRecord.presentedList ?? sanitizedSemanticRecord.stateMutationHints.lastPresentedList;
        referencedEntities = sanitizedSemanticRecord.referencedEntities;
      }
    }

    return {
      ...(referencedMessage.transportMessageId
        ? { transportMessageId: referencedMessage.transportMessageId }
        : {}),
      conversationMessageId: referencedMessage._id,
      role: referencedMessage.role,
      text: referencedMessage.content,
      ...(presentedList ? { presentedList } : {}),
      ...(referencedEntities && referencedEntities.length > 0 ? { referencedEntities } : {}),
    };
  },
});

export const listRelevantAssistantSemanticRecords = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    limit: v.number(),
    beforeTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<AssistantSemanticRecordDto[]> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const limit = normalizePositiveInteger(args.limit, "limit");
    const records = await ctx.db
      .query("assistantSemanticRecords")
      .withIndex("by_conversation_created_at", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .collect();

    const filteredRecords = records
      .filter((record) => record.companyId === args.companyId)
      .filter((record) => args.beforeTimestamp === undefined || record.createdAt <= args.beforeTimestamp)
      .slice(0, limit);

    const sanitizedRecords: AssistantSemanticRecordDto[] = [];
    for (const record of filteredRecords) {
      sanitizedRecords.push(
        await sanitizeAssistantSemanticRecordDto(ctx, args.companyId, toAssistantSemanticRecordDto(record)),
      );
    }

    return sanitizedRecords;
  },
});

export const getLatestConversationSummary = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<ConversationSummaryDto | null> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const summary = await loadLatestConversationSummaryDoc(ctx, args.conversationId);

    return summary && summary.companyId === args.companyId ? toConversationSummaryDto(summary) : null;
  },
});

export const persistAssistantSemanticRecord = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    assistantMessageId: v.id("messages"),
    schemaVersion: v.literal("v1"),
    actionType: v.union(v.literal("none"), v.literal("clarify"), v.literal("handoff")),
    normalizedAction: v.union(
      v.literal("answer"),
      v.literal("present_list"),
      v.literal("clarify"),
      v.literal("handoff"),
      v.literal("fallback"),
    ),
    semanticRecordStatus: v.union(
      v.literal("complete"),
      v.literal("partial"),
      v.literal("unavailable"),
      v.literal("skipped"),
    ),
    presentedNumberedList: v.boolean(),
    orderedPresentedEntityIds: v.array(v.string()),
    displayIndexToEntityIdMap: v.array(v.object({
      displayIndex: v.number(),
      entityId: v.string(),
    })),
    presentedList: v.optional(v.object({
      kind: v.union(v.literal("category"), v.literal("product"), v.literal("variant"), v.literal("catalog_slice")),
      items: v.array(v.object({
        displayIndex: v.number(),
        entityKind: v.union(v.literal("category"), v.literal("product"), v.literal("variant"), v.literal("catalog_slice")),
        entityId: v.string(),
        score: v.optional(v.number()),
      })),
      source: v.optional(v.union(
        v.literal("system_seed"),
        v.literal("system_passthrough"),
        v.literal("assistant_action"),
        v.literal("retrieval_single_candidate"),
        v.literal("quoted_reference"),
        v.literal("heuristic"),
      )),
      updatedAt: v.optional(v.number()),
    })),
    referencedEntities: v.array(v.object({
      entityKind: v.union(v.literal("category"), v.literal("product"), v.literal("variant")),
      entityId: v.string(),
      source: v.union(
        v.literal("quoted_reference"),
        v.literal("current_focus"),
        v.literal("last_presented_list"),
        v.literal("pending_clarification"),
        v.literal("semantic_assistant_record"),
        v.literal("recent_turns"),
        v.literal("summary"),
        v.literal("raw_text"),
        v.literal("heuristic_hint"),
      ),
      confidence: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    })),
    resolvedStandaloneQueryUsed: v.optional(v.object({
      text: v.string(),
      status: v.union(v.literal("used"), v.literal("not_used")),
    })),
    responseLanguage: v.optional(v.union(v.literal("ar"), v.literal("en"))),
    responseMode: v.union(
      v.literal("grounded"),
      v.literal("inferred"),
      v.literal("clarified"),
      v.literal("fallback"),
      v.literal("handoff"),
    ),
    groundingSourceMetadata: v.object({
      usedRetrieval: v.boolean(),
      usedConversationState: v.boolean(),
      usedSummary: v.boolean(),
      retrievalMode: v.optional(v.union(
        v.literal("raw_latest_message"),
        v.literal("semantic_catalog_search"),
        v.literal("direct_entity_lookup"),
        v.literal("variant_lookup"),
        v.literal("filtered_catalog_search"),
        v.literal("skip_retrieval"),
        v.literal("clarification_required"),
      )),
      groundedEntityIds: v.array(v.string()),
    }),
    handoffRationale: v.optional(v.object({
      reasonCode: v.string(),
      detail: v.optional(v.string()),
    })),
    clarificationRationale: v.optional(v.object({
      reasonCode: v.string(),
      detail: v.optional(v.string()),
    })),
    stateMutationHints: v.object({
      focusKind: v.optional(v.union(
        v.literal("none"),
        v.literal("category"),
        v.literal("product"),
        v.literal("variant"),
        v.literal("catalog_slice"),
      )),
      focusEntityIds: v.array(v.string()),
      shouldSetPendingClarification: v.boolean(),
      latestStandaloneQueryText: v.optional(v.string()),
      lastPresentedList: v.optional(v.object({
        kind: v.union(v.literal("category"), v.literal("product"), v.literal("variant"), v.literal("catalog_slice")),
        items: v.array(v.object({
          displayIndex: v.number(),
          entityKind: v.union(v.literal("category"), v.literal("product"), v.literal("variant"), v.literal("catalog_slice")),
          entityId: v.string(),
          score: v.optional(v.number()),
        })),
        source: v.optional(v.union(
          v.literal("system_seed"),
          v.literal("system_passthrough"),
          v.literal("assistant_action"),
          v.literal("retrieval_single_candidate"),
          v.literal("quoted_reference"),
          v.literal("heuristic"),
        )),
        updatedAt: v.optional(v.number()),
      })),
    }),
    createdAt: v.number(),
  },
  handler: async (ctx, args): Promise<AssistantSemanticRecordDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const assistantMessage = await loadMessageOrThrow(ctx, args.assistantMessageId);
    if (assistantMessage.conversationId !== args.conversationId || assistantMessage.role !== "assistant") {
      throw new Error("Assistant message not found for conversation");
    }

    const existing = await loadAssistantSemanticRecordByMessageId(ctx, args.assistantMessageId);
    if (existing) {
      throw new Error("Assistant semantic record already exists for message");
    }

    const sanitizedRecord = await sanitizeAssistantSemanticRecordDto(ctx, args.companyId, {
      id: args.assistantMessageId,
      schemaVersion: ASSISTANT_SEMANTIC_RECORD_SCHEMA_VERSION,
      companyId: args.companyId,
      conversationId: args.conversationId,
      assistantMessageId: args.assistantMessageId,
      actionType: args.actionType,
      normalizedAction: args.normalizedAction,
      semanticRecordStatus: args.semanticRecordStatus,
      presentedNumberedList: args.presentedNumberedList,
      orderedPresentedEntityIds: [...args.orderedPresentedEntityIds],
      displayIndexToEntityIdMap: [...args.displayIndexToEntityIdMap],
      ...(args.presentedList ? { presentedList: args.presentedList } : {}),
      referencedEntities: [...args.referencedEntities],
      ...(args.resolvedStandaloneQueryUsed
        ? { resolvedStandaloneQueryUsed: args.resolvedStandaloneQueryUsed }
        : {}),
      ...(args.responseLanguage ? { responseLanguage: args.responseLanguage } : {}),
      responseMode: args.responseMode,
      groundingSourceMetadata: {
        ...args.groundingSourceMetadata,
        groundedEntityIds: [...args.groundingSourceMetadata.groundedEntityIds],
      },
      ...(args.handoffRationale ? { handoffRationale: args.handoffRationale } : {}),
      ...(args.clarificationRationale ? { clarificationRationale: args.clarificationRationale } : {}),
      stateMutationHints: {
        ...args.stateMutationHints,
        focusEntityIds: [...args.stateMutationHints.focusEntityIds],
      },
      createdAt: args.createdAt,
    });

    const recordId = await ctx.db.insert("assistantSemanticRecords", {
      companyId: args.companyId,
      conversationId: args.conversationId,
      assistantMessageId: args.assistantMessageId,
      schemaVersion: sanitizedRecord.schemaVersion,
      actionType: sanitizedRecord.actionType,
      normalizedAction: sanitizedRecord.normalizedAction,
      semanticRecordStatus: sanitizedRecord.semanticRecordStatus,
      presentedNumberedList: sanitizedRecord.presentedNumberedList,
      orderedPresentedEntityIds: sanitizedRecord.orderedPresentedEntityIds,
      displayIndexToEntityIdMap: sanitizedRecord.displayIndexToEntityIdMap,
      ...(sanitizedRecord.presentedList ? { presentedList: sanitizedRecord.presentedList } : {}),
      referencedEntities: sanitizedRecord.referencedEntities,
      ...(sanitizedRecord.resolvedStandaloneQueryUsed
        ? { resolvedStandaloneQueryUsed: sanitizedRecord.resolvedStandaloneQueryUsed }
        : {}),
      ...(sanitizedRecord.responseLanguage ? { responseLanguage: sanitizedRecord.responseLanguage } : {}),
      responseMode: sanitizedRecord.responseMode,
      groundingSourceMetadata: sanitizedRecord.groundingSourceMetadata,
      ...(sanitizedRecord.handoffRationale ? { handoffRationale: sanitizedRecord.handoffRationale } : {}),
      ...(sanitizedRecord.clarificationRationale
        ? { clarificationRationale: sanitizedRecord.clarificationRationale }
        : {}),
      stateMutationHints: sanitizedRecord.stateMutationHints,
      createdAt: sanitizedRecord.createdAt,
    });

    return toAssistantSemanticRecordDto(await ctx.db.get(recordId) as Doc<"assistantSemanticRecords">);
  },
});

export const upsertConversationSummary = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    summaryId: v.string(),
    durableCustomerGoal: v.optional(v.string()),
    stablePreferences: v.array(v.string()),
    importantResolvedDecisions: v.array(v.object({
      summary: v.string(),
      source: v.optional(v.string()),
    })),
    historicalContextNeededForFutureTurns: v.array(v.string()),
    freshness: v.object({
      status: v.union(v.literal("fresh"), v.literal("stale")),
      updatedAt: v.optional(v.number()),
    }),
    provenance: v.object({
      source: v.union(v.literal("shadow"), v.literal("system_seed"), v.literal("summary_job")),
      generatedAt: v.optional(v.number()),
    }),
    coveredMessageRange: v.object({
      fromMessageId: v.optional(v.string()),
      toMessageId: v.optional(v.string()),
      messageCount: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args): Promise<ConversationSummaryDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const freshnessUpdatedAt = normalizeTimestamp(args.freshness.updatedAt, Date.now());
    const existing = await loadConversationSummaryByConversationAndSummaryId(
      ctx,
      args.conversationId,
      args.summaryId,
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.durableCustomerGoal ? { durableCustomerGoal: args.durableCustomerGoal } : {}),
        stablePreferences: [...args.stablePreferences],
        importantResolvedDecisions: [...args.importantResolvedDecisions],
        historicalContextNeededForFutureTurns: [...args.historicalContextNeededForFutureTurns],
        freshness: {
          ...args.freshness,
          updatedAt: freshnessUpdatedAt,
        },
        freshnessUpdatedAt,
        provenance: args.provenance,
        coveredMessageRange: args.coveredMessageRange,
      });

      return toConversationSummaryDto(await ctx.db.get(existing._id) as Doc<"conversationSummaries">);
    }

    const summaryId = await ctx.db.insert("conversationSummaries", {
      companyId: args.companyId,
      conversationId: args.conversationId,
      summaryId: args.summaryId,
      ...(args.durableCustomerGoal ? { durableCustomerGoal: args.durableCustomerGoal } : {}),
      stablePreferences: [...args.stablePreferences],
      importantResolvedDecisions: [...args.importantResolvedDecisions],
      historicalContextNeededForFutureTurns: [...args.historicalContextNeededForFutureTurns],
      freshness: {
        ...args.freshness,
        updatedAt: freshnessUpdatedAt,
      },
      freshnessUpdatedAt,
      provenance: args.provenance,
      coveredMessageRange: args.coveredMessageRange,
    });

    return toConversationSummaryDto(await ctx.db.get(summaryId) as Doc<"conversationSummaries">);
  },
});

export const applyCanonicalConversationTurnOutcome = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    responseLanguage: v.optional(v.union(v.literal("ar"), v.literal("en"))),
    latestUserMessageText: v.string(),
    assistantActionType: v.union(v.literal("none"), v.literal("clarify"), v.literal("handoff")),
    committedAssistantTimestamp: v.number(),
    promptHistorySelectionMode: v.union(
      v.literal("no_history"),
      v.literal("recent_window"),
      v.literal("stale_reset_empty"),
      v.literal("quoted_reference_window"),
    ),
    usedQuotedReference: v.boolean(),
    referencedTransportMessageId: v.optional(v.string()),
    retrievalOutcome: v.union(v.literal("grounded"), v.literal("empty"), v.literal("low_signal")),
    candidates: v.array(v.object({
      entityKind: v.union(v.literal("category"), v.literal("product"), v.literal("variant")),
      entityId: v.string(),
      score: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<CanonicalConversationStateDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);

    const existingState = await loadCanonicalConversationStateDoc(ctx, args.conversationId);
    const baseState = existingState
      ? toCanonicalConversationStateDto(existingState)
      : createSeedCanonicalConversationState(args.companyId, args.conversationId);
    const sanitizedBase = await sanitizeCanonicalConversationState(ctx, {
      companyId: args.companyId,
      state: baseState,
      now: args.committedAssistantTimestamp,
    });
    const candidates = (
      await sanitizeCanonicalHeuristicCandidates(
        ctx,
        args.companyId,
        normalizeCanonicalCandidates(args.candidates),
        "heuristicHints.topCandidates",
      )
    ).candidates;
    const retrievalOrderListProxy = buildCanonicalRetrievalOrderListProxy(
      candidates,
      args.committedAssistantTimestamp,
    );
    const heuristicFocus = buildCanonicalHeuristicFocus(candidates, args.committedAssistantTimestamp);
    const singleFocusCandidate =
      args.retrievalOutcome === "grounded" && candidates.length === 1
        ? candidates[0]
        : undefined;
    const nextCurrentFocus = singleFocusCandidate
      ? {
        kind: singleFocusCandidate.entityKind,
        entityIds: [singleFocusCandidate.entityId],
        source: "retrieval_single_candidate" as const,
        updatedAt: args.committedAssistantTimestamp,
      }
      : sanitizedBase.state.currentFocus;
    const nextState: CanonicalConversationStateDto = {
      ...sanitizedBase.state,
      ...(args.responseLanguage ? { responseLanguage: args.responseLanguage } : {}),
      currentFocus: nextCurrentFocus,
      pendingClarification: args.assistantActionType === "clarify"
        ? {
          active: true,
          source: "assistant_action",
          updatedAt: args.committedAssistantTimestamp,
        }
        : {
          active: false,
          updatedAt: args.committedAssistantTimestamp,
        },
      latestStandaloneQuery: {
        text: args.latestUserMessageText.trim(),
        status: "unresolved_passthrough",
        source: "system_passthrough",
        updatedAt: args.committedAssistantTimestamp,
      },
      freshness: {
        status: "fresh",
        updatedAt: args.committedAssistantTimestamp,
        activeWindowExpiresAt: args.committedAssistantTimestamp + STALE_CONTEXT_RESET_MS,
      },
      sourceOfTruthMarkers: {
        ...sanitizedBase.state.sourceOfTruthMarkers,
        ...(args.responseLanguage ? { responseLanguage: "system_passthrough" as const } : {}),
        ...(singleFocusCandidate ? { currentFocus: "retrieval_single_candidate" as const } : {}),
        ...(args.assistantActionType === "clarify" ? { pendingClarification: "assistant_action" as const } : {}),
        latestStandaloneQuery: "system_passthrough",
      },
      heuristicHints: {
        promptHistorySelectionMode: args.promptHistorySelectionMode,
        usedQuotedReference: args.usedQuotedReference,
        ...(args.referencedTransportMessageId
          ? { referencedTransportMessageId: args.referencedTransportMessageId }
          : {}),
        retrievalOutcome: args.retrievalOutcome,
        topCandidates: candidates,
        ...(retrievalOrderListProxy ? { retrievalOrderListProxy } : {}),
        ...(heuristicFocus ? { heuristicFocus } : {}),
      },
    };
    const persistedState = {
      ...nextState,
      companyId: args.companyId,
      conversationId: args.conversationId,
    };

    if (existingState) {
      await ctx.db.patch(existingState._id, persistedState);
    } else {
      await ctx.db.insert("conversationCanonicalStates", persistedState);
    }

    return nextState;
  },
});

export const appendConversationMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content,
      timestamp,
      ...(args.role === "assistant" ? { deliveryState: "sent" as const } : {}),
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
    });
    const message = await ctx.db.get(messageId);
    if (!message) {
      throw new Error("Created message could not be loaded");
    }

    return toMessageDto(message);
  },
});

export const appendMutedCustomerMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      throw new Error("Conversation is not muted");
    }

    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );
    const existingMessage = await resolveExistingMessageInsert(ctx, args.conversationId, transportMessageId);
    if (existingMessage) {
      return toConversationDto(conversation);
    }

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content,
      timestamp,
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
    });

    await ctx.db.patch(conversation._id, {
      lastCustomerMessageAt: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const appendInboundCustomerMessageToConversation = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AppendInboundCustomerMessageResult> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );
    const existingMessage = await resolveExistingMessageInsert(ctx, args.conversationId, transportMessageId);
    if (existingMessage) {
      return {
        conversation: toConversationDto(conversation),
        wasMuted: conversation.muted,
        wasDuplicate: true,
      };
    }

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content,
      timestamp,
      ...(transportMessageId ? { transportMessageId } : {}),
      ...(referencedTransportMessageId ? { referencedTransportMessageId } : {}),
    });

    if (!conversation.muted) {
      return {
        conversation: toConversationDto(conversation),
        wasMuted: false,
        wasDuplicate: false,
      };
    }

    await ctx.db.patch(conversation._id, {
      lastCustomerMessageAt: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return {
      conversation: toConversationDto(updatedConversation),
      wasMuted: true,
      wasDuplicate: false,
    };
  },
});

export const appendInboundCustomerMessage = internalAction({
  args: {
    companyId: v.id("companies"),
    phoneNumber: v.string(),
    content: v.string(),
    timestamp: v.optional(v.number()),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AppendInboundCustomerMessageResult> => {
    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    return withConversationLock(ctx, args, async () => {
      const existing = await ctx.runQuery(internal.conversations.getConversationByPhone, {
        companyId: args.companyId,
        phoneNumber,
      });
      const conversation = existing ?? await ctx.runMutation(internal.conversations.ensureActiveConversation, {
        companyId: args.companyId,
        phoneNumber,
      });

      return ctx.runMutation(internal.conversations.appendInboundCustomerMessageToConversation, {
        companyId: args.companyId,
        conversationId: conversation.id as Id<"conversations">,
        content: args.content,
        timestamp: args.timestamp,
        transportMessageId: args.transportMessageId,
        referencedTransportMessageId: args.referencedTransportMessageId,
      });
    });
  },
});

export const getConversationMessage = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto | null> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.conversationId !== args.conversationId) {
      return null;
    }

    return toMessageDto(message);
  },
});

export const appendPendingAssistantMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
    source: v.optional(v.union(
      v.literal("assistant_action"),
      v.literal("provider_failure_fallback"),
      v.literal("invalid_model_output_fallback"),
    )),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const source = normalizeOptionalHandoffSource(args.source);
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content,
      timestamp,
      deliveryState: "pending",
      ...(source ? { handoffSource: source } : {}),
      ...(reason ? { handoffReason: reason } : {}),
      ...(actorPhoneNumber ? { handoffActorPhoneNumber: actorPhoneNumber } : {}),
      ...(args.metadata ? { handoffMetadata: args.metadata } : {}),
    });
    return toMessageDto(await loadMessageOrThrow(ctx, messageId));
  },
});

export const acknowledgePendingAssistantMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    pendingMessageId: v.id("messages"),
    acknowledgedAt: v.number(),
    transportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== "assistant") {
      throw new Error("Pending assistant message not found for conversation");
    }

    if (message.deliveryState !== "pending") {
      throw new Error("Only pending assistant messages can be acknowledged");
    }

    if (message.providerAcknowledgedAt !== undefined) {
      return toMessageDto(message);
    }

    const acknowledgedAt = normalizeTimestamp(args.acknowledgedAt, Date.now());
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    await ctx.db.patch(message._id, {
      providerAcknowledgedAt: acknowledgedAt,
      sideEffectsState: "pending",
      analyticsState: message.handoffSource ? "pending" : "not_applicable",
      ownerNotificationState: message.handoffSource ? "pending" : "not_applicable",
      ...(transportMessageId ? { transportMessageId } : {}),
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
});

export const listPendingAssistantMessages = internalQuery({
  args: {
    olderThanOrAt: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<PendingAssistantMessageCandidate[]> => {
    const olderThanOrAt = normalizeTimestamp(args.olderThanOrAt, Date.now());
    const limit = normalizePositiveInteger(args.limit, "limit");
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_role_delivery_ack_time", (q) =>
        q.eq("role", "assistant").eq("deliveryState", "pending").lte("providerAcknowledgedAt", olderThanOrAt)
      )
      .take(limit);

    const candidates: PendingAssistantMessageCandidate[] = [];
    for (const message of messages) {
      if (message.providerAcknowledgedAt === undefined) {
        continue;
      }

      const conversation = await ctx.db.get(message.conversationId);
      if (!conversation) {
        continue;
      }

      candidates.push({
        messageId: message._id,
        conversationId: message.conversationId,
        companyId: conversation.companyId,
        phoneNumber: conversation.phoneNumber,
        timestamp: message.timestamp,
        ...(message.transportMessageId ? { transportMessageId: message.transportMessageId } : {}),
        ...(message.analyticsState ? { analyticsState: message.analyticsState } : {}),
        ...(message.ownerNotificationState ? { ownerNotificationState: message.ownerNotificationState } : {}),
      });
    }

    return candidates;
  },
});

export const getConversationOwnerNotificationContext = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<{ companyName: string; ownerPhone: string } | null> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const company = await ctx.db.get(conversation.companyId);
    if (!company) {
      return null;
    }

    return {
      companyName: company.name,
      ownerPhone: company.ownerPhone,
    };
  },
});

export const commitPendingAssistantMessage = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    pendingMessageId: v.id("messages"),
    transportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== "assistant") {
      throw new Error("Pending assistant message not found for conversation");
    }

    if (message.deliveryState !== "pending") {
      throw new Error("Only pending assistant messages can be committed");
    }

    if (message.providerAcknowledgedAt === undefined) {
      throw new Error("Pending assistant message must be acknowledged before commit");
    }

    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");
    await ctx.db.patch(message._id, {
      deliveryState: "sent",
      ...(message.analyticsState === "not_applicable" && message.ownerNotificationState === "not_applicable"
        ? { sideEffectsState: "completed" as const }
        : {}),
      ...(transportMessageId ? { transportMessageId } : {}),
    });

    const updatedMessage = await loadMessageOrThrow(ctx, args.pendingMessageId);
    await applyAssistantHandoffIfNeeded(ctx, {
      companyId: args.companyId,
      conversation,
      message: updatedMessage,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const markPendingAssistantMessageFailed = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    pendingMessageId: v.id("messages"),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== "assistant") {
      throw new Error("Pending assistant message not found for conversation");
    }

    if (message.deliveryState !== "pending") {
      throw new Error("Only pending assistant messages can be marked failed");
    }

    if (message.providerAcknowledgedAt !== undefined) {
      throw new Error("Acknowledged assistant messages must be reconciled, not marked failed");
    }

    await ctx.db.patch(message._id, {
      deliveryState: "failed",
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
});

export const completePendingAssistantSideEffects = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    pendingMessageId: v.id("messages"),
    analyticsCompleted: v.optional(v.boolean()),
    ownerNotificationCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== "assistant") {
      throw new Error("Pending assistant message not found for conversation");
    }

    if (message.deliveryState !== "sent") {
      throw new Error("Assistant side effects can only be completed after send");
    }

    const nextAnalyticsState =
      args.analyticsCompleted === true
        && (message.analyticsState === "pending" || message.analyticsState === "recorded")
        ? "completed"
        : message.analyticsState;
    const nextOwnerNotificationState =
      args.ownerNotificationCompleted === true
        && (message.ownerNotificationState === "pending" || message.ownerNotificationState === "sent")
        ? "completed"
        : message.ownerNotificationState;

    await ctx.db.patch(message._id, {
      ...(nextAnalyticsState ? { analyticsState: nextAnalyticsState } : {}),
      ...(nextOwnerNotificationState ? { ownerNotificationState: nextOwnerNotificationState } : {}),
      sideEffectsState: resolveSideEffectsState({
        analyticsState: nextAnalyticsState,
        ownerNotificationState: nextOwnerNotificationState,
      }),
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
});

export const recordPendingAssistantSideEffectProgress = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    pendingMessageId: v.id("messages"),
    analyticsRecorded: v.optional(v.boolean()),
    ownerNotificationSent: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const message = await loadMessageOrThrow(ctx, args.pendingMessageId);
    if (message.conversationId !== args.conversationId || message.role !== "assistant") {
      throw new Error("Pending assistant message not found for conversation");
    }

    if (message.deliveryState !== "sent") {
      throw new Error("Assistant side effect progress can only be recorded after send");
    }

    const nextAnalyticsState =
      args.analyticsRecorded === true && message.analyticsState === "pending"
        ? "recorded"
        : message.analyticsState;
    const nextOwnerNotificationState =
      args.ownerNotificationSent === true && message.ownerNotificationState === "pending"
        ? "sent"
        : message.ownerNotificationState;

    await ctx.db.patch(message._id, {
      ...(nextAnalyticsState ? { analyticsState: nextAnalyticsState } : {}),
      ...(nextOwnerNotificationState ? { ownerNotificationState: nextOwnerNotificationState } : {}),
      sideEffectsState: resolveSideEffectsState({
        analyticsState: nextAnalyticsState,
        ownerNotificationState: nextOwnerNotificationState,
      }),
    });

    return toMessageDto(await loadMessageOrThrow(ctx, args.pendingMessageId));
  },
});

export const appendAssistantMessageAndStartHandoff = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    content: v.string(),
    timestamp: v.optional(v.number()),
    source: v.union(
      v.literal("assistant_action"),
      v.literal("provider_failure_fallback"),
      v.literal("invalid_model_output_fallback"),
    ),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
    transportMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (conversation.muted) {
      return toConversationDto(conversation);
    }

    const content = normalizeMessageContent(args.content);
    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");
    const transportMessageId = normalizeOptionalMessageId(args.transportMessageId, "transportMessageId");

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content,
      timestamp,
      deliveryState: "sent",
      handoffSource: args.source,
      ...(reason ? { handoffReason: reason } : {}),
      ...(actorPhoneNumber ? { handoffActorPhoneNumber: actorPhoneNumber } : {}),
      ...(args.metadata ? { handoffMetadata: args.metadata } : {}),
      ...(transportMessageId ? { transportMessageId } : {}),
    });
    const message = await loadMessageOrThrow(ctx, messageId);
    await applyAssistantHandoffIfNeeded(ctx, {
      companyId: args.companyId,
      conversation,
      message,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const listConversationMessages = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationMessageDto[]> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const limit = normalizeOptionalLimit(args.limit);

    if (limit !== undefined) {
      return (await listVisibleConversationMessagesDescending(ctx, args.conversationId, limit))
        .reverse()
        .map(toMessageDto);
    }

    const visibleMessages = (await listConversationMessageDocsDescending(ctx, args.conversationId))
      .filter(isVisibleConversationMessage);
    return visibleMessages
      .reverse()
      .map(toMessageDto);
  },
});

export const listDueAutoResumeConversations = internalQuery({
  args: {
    now: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto[]> => {
    const now = normalizeTimestamp(args.now, Date.now());
    const limit = normalizePositiveInteger(args.limit, "limit");
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_muted_next_auto_resume_at", (q) => q.eq("muted", true).lte("nextAutoResumeAt", now))
      .take(limit);

    return conversations.map(toConversationDto);
  },
});

export const getPromptHistory = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<PromptHistoryTurn[]> => {
    const messages = await ctx.runQuery(internal.conversations.listConversationMessages, {
      companyId: args.companyId,
      conversationId: args.conversationId,
      limit: normalizePositiveInteger(args.limit, "limit"),
    });

    return messages.map(toPromptHistoryTurn);
  },
});

export const getPromptHistoryForInbound = internalQuery({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    inboundTimestamp: v.number(),
    currentTransportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<PromptHistorySelection<PromptHistoryTurn>> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const inboundTimestamp = normalizeTimestamp(args.inboundTimestamp, Date.now());
    const limit = normalizePositiveInteger(args.limit, "limit");
    const currentTransportMessageId = normalizeOptionalMessageId(
      args.currentTransportMessageId,
      "currentTransportMessageId",
    );
    const referencedTransportMessageId = normalizeOptionalMessageId(
      args.referencedTransportMessageId,
      "referencedTransportMessageId",
    );

    const priorMessagesDescending = await collectPriorMessagesDescending(ctx, args.conversationId, {
      inboundTimestamp,
      ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
      stopWhenPriorMessagesFound: true,
    });

    if (priorMessagesDescending.length === 0) {
      return toPromptHistorySelection([], "no_history");
    }

    const latestMessage = priorMessagesDescending[0];
    const activeWindowStart = inboundTimestamp - STALE_CONTEXT_RESET_MS;
    if (latestMessage && latestMessage.timestamp >= activeWindowStart) {
      const recentPriorMessages = await collectPriorMessagesDescending(ctx, args.conversationId, {
        inboundTimestamp,
        ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
        minimumCount: limit,
      });
      return toPromptHistorySelection(
        recentPriorMessages.slice(0, limit).reverse().map(toPromptHistoryTurn),
        "recent_window",
      );
    }

    if (!referencedTransportMessageId) {
      return toPromptHistorySelection([], "stale_reset_empty");
    }

    const referencedMessage = await resolveMessageByTransportMessageId(
      ctx,
      args.conversationId,
      referencedTransportMessageId,
    );
    if (!referencedMessage) {
      return toPromptHistorySelection([], "stale_reset_empty");
    }

    if (referencedMessage.timestamp >= activeWindowStart) {
      const recentPriorMessages = await collectPriorMessagesDescending(ctx, args.conversationId, {
        inboundTimestamp,
        ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
        minimumCount: limit,
      });
      return toPromptHistorySelection(
        recentPriorMessages.slice(0, limit).reverse().map(toPromptHistoryTurn),
        "recent_window",
      );
    }

    const referencedWindow = await collectReferencedHistorySliceAscending(ctx, args.conversationId, {
      inboundTimestamp,
      ...(currentTransportMessageId ? { currentTransportMessageId } : {}),
      referencedMessageId: referencedMessage._id,
    });
    const referencedIndex = referencedWindow.findIndex(
      (message) => message.id === referencedMessage._id,
    );
    const centeredStart = referencedIndex === -1
      ? 0
      : Math.max(0, referencedIndex - Math.floor((limit - 1) / 2));
    const sliceStart = Math.min(centeredStart, Math.max(0, referencedWindow.length - limit));
    const referencedTurns = referencedWindow
      .slice(sliceStart, sliceStart + limit)
      .map(toPromptHistoryTurn);

    return referencedTurns.length === 0
      ? toPromptHistorySelection([], "stale_reset_empty")
      : toPromptHistorySelection(referencedTurns, "quoted_reference_window");
  },
});

export const trimConversationMessages = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    maxMessages: v.number(),
  },
  handler: async (ctx, args): Promise<TrimConversationMessagesResult> => {
    await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    const maxMessages = normalizePositiveInteger(args.maxMessages, "maxMessages");
    let cursor: string | null = null;
    let totalMessages = 0;
    const idsToDelete: Array<Id<"messages">> = [];
    const retainedIds: Array<Id<"messages">> = [];

    for (;;) {
      const page = await ctx.db
        .query("messages")
        .withIndex("by_conversation_time", (q) => q.eq("conversationId", args.conversationId))
        .paginate({
          cursor,
          numItems: TRIM_MESSAGES_BATCH_SIZE,
        });

      totalMessages += page.page.length;
      for (const message of page.page) {
        retainedIds.push(message._id);
        if (retainedIds.length > maxMessages) {
          const oldestRetainedId = retainedIds.shift();
          if (oldestRetainedId) {
            idsToDelete.push(oldestRetainedId);
          }
        }
      }

      if (page.isDone || page.page.length === 0) {
        break;
      }

      cursor = page.continueCursor;
    }

    const excessCount = Math.max(totalMessages - maxMessages, 0);
    if (excessCount === 0) {
      return {
        deletedCount: 0,
        remainingCount: totalMessages,
      };
    }

    let deletedCount = 0;
    while (deletedCount < excessCount) {
      const batchIds = idsToDelete.slice(deletedCount, deletedCount + TRIM_MESSAGES_BATCH_SIZE);
      for (const messageId of batchIds) {
        await ctx.db.delete(messageId);
        deletedCount += 1;
      }
    }

    return {
      deletedCount,
      remainingCount: totalMessages - deletedCount,
    };
  },
});

export const startHandoff = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    triggerTimestamp: v.optional(v.number()),
    source: v.union(
      v.literal("assistant_action"),
      v.literal("provider_failure_fallback"),
      v.literal("invalid_model_output_fallback"),
      v.literal("api_manual"),
    ),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (conversation.muted) {
      return toConversationDto(conversation);
    }

    const triggerTimestamp = normalizeTimestamp(args.triggerTimestamp, Date.now());
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");

    await ctx.db.patch(conversation._id, {
      muted: true,
      mutedAt: triggerTimestamp,
      handoffSeedTimestamp: triggerTimestamp,
      nextAutoResumeAt: triggerTimestamp + AUTO_RESUME_IDLE_MS,
    });

    await insertConversationStateEvent(ctx, {
      companyId: args.companyId,
      conversationId: conversation._id,
      phoneNumber: conversation.phoneNumber,
      eventType: "handoff_started",
      timestamp: triggerTimestamp,
      source: args.source,
      ...(reason ? { reason } : {}),
      ...(actorPhoneNumber ? { actorPhoneNumber } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const resumeConversation = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    resumedAt: v.optional(v.number()),
    source: v.union(v.literal("api_manual"), v.literal("worker_auto")),
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      return toConversationDto(conversation);
    }

    const resumedAt = normalizeTimestamp(args.resumedAt, Date.now());
    const reason = normalizeOptionalString(args.reason, "reason");
    const actorPhoneNumber = normalizeOptionalString(args.actorPhoneNumber, "actorPhoneNumber");

    if (
      conversation.nextAutoResumeAt === undefined
      || conversation.nextAutoResumeAt > resumedAt
    ) {
      return toConversationDto(conversation);
    }

    await ctx.db.patch(conversation._id, {
      muted: false,
      mutedAt: undefined,
      handoffSeedTimestamp: undefined,
      nextAutoResumeAt: undefined,
    });

    await insertConversationStateEvent(ctx, {
      companyId: args.companyId,
      conversationId: conversation._id,
      phoneNumber: conversation.phoneNumber,
      eventType: args.source === "api_manual" ? "handoff_resumed_manual" : "handoff_resumed_auto",
      timestamp: resumedAt,
      source: args.source,
      ...(reason ? { reason } : {}),
      ...(actorPhoneNumber ? { actorPhoneNumber } : {}),
      ...(args.metadata ? { metadata: args.metadata } : {}),
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});

export const recordMutedCustomerActivity = internalMutation({
  args: {
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConversationRecordDto> => {
    const conversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    if (!conversation.muted) {
      throw new Error("Conversation is not muted");
    }

    const timestamp = normalizeTimestamp(args.timestamp, Date.now());
    await ctx.db.patch(conversation._id, {
      lastCustomerMessageAt: timestamp,
      nextAutoResumeAt: timestamp + AUTO_RESUME_IDLE_MS,
    });

    const updatedConversation = await loadConversationOrThrow(ctx, args.companyId, args.conversationId);
    return toConversationDto(updatedConversation);
  },
});
