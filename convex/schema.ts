import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  ASSISTANT_SEMANTIC_NORMALIZED_ACTION_VALUES,
  ASSISTANT_SEMANTIC_RECORD_STATUS_VALUES,
  ASSISTANT_SEMANTIC_RESPONSE_MODE_VALUES,
  BOT_RUNTIME_SESSION_STATES,
  CANONICAL_CONVERSATION_FOCUS_KINDS,
  CANONICAL_CONVERSATION_FRESHNESS_STATUSES,
  CANONICAL_CONVERSATION_PRESENTABLE_KINDS,
  CANONICAL_CONVERSATION_QUERY_STATUSES,
  CANONICAL_CONVERSATION_SOURCE_VALUES,
  CONVERSATION_LIFECYCLE_EVENT_SOURCES,
  CONVERSATION_LIFECYCLE_EVENT_TYPES,
  TURN_REFERENCED_ENTITY_SOURCE_VALUES,
} from '@cs/shared';

// ── Reusable field patterns ──────────────────────────────────────────────────
const flexRecord = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);
const productImageValidator = v.object({
  id: v.string(),
  key: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  etag: v.optional(v.string()),
  alt: v.optional(v.string()),
  uploadedAt: v.number(),
});
const productImageUploadStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("expired"),
);
const mediaCleanupStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("retry"),
  v.literal("completed"),
  v.literal("failed"),
);
const conversationStateEventTypeValidator = v.union(
  ...CONVERSATION_LIFECYCLE_EVENT_TYPES.map((eventType) => v.literal(eventType)),
);
const conversationStateEventSourceValidator = v.union(
  ...CONVERSATION_LIFECYCLE_EVENT_SOURCES.map((source) => v.literal(source)),
);
const canonicalConversationSourceValidator = v.union(
  ...CANONICAL_CONVERSATION_SOURCE_VALUES.map((source) => v.literal(source)),
);
const canonicalConversationFocusKindValidator = v.union(
  ...CANONICAL_CONVERSATION_FOCUS_KINDS.map((kind) => v.literal(kind)),
);
const canonicalConversationPresentableKindValidator = v.union(
  ...CANONICAL_CONVERSATION_PRESENTABLE_KINDS.map((kind) => v.literal(kind)),
);
const canonicalConversationFreshnessStatusValidator = v.union(
  ...CANONICAL_CONVERSATION_FRESHNESS_STATUSES.map((status) => v.literal(status)),
);
const canonicalConversationQueryStatusValidator = v.union(
  ...CANONICAL_CONVERSATION_QUERY_STATUSES.map((status) => v.literal(status)),
);
const promptHistorySelectionModeValidator = v.union(
  v.literal("no_history"),
  v.literal("recent_window"),
  v.literal("stale_reset_empty"),
  v.literal("quoted_reference_window"),
);
const retrievalOutcomeValidator = v.union(
  v.literal("grounded"),
  v.literal("empty"),
  v.literal("low_signal"),
);
const canonicalConversationFocusValidator = v.object({
  kind: canonicalConversationFocusKindValidator,
  entityIds: v.array(v.string()),
  source: v.optional(canonicalConversationSourceValidator),
  updatedAt: v.optional(v.number()),
});
const canonicalConversationPresentedListItemValidator = v.object({
  displayIndex: v.number(),
  entityKind: canonicalConversationPresentableKindValidator,
  entityId: v.string(),
  score: v.optional(v.number()),
});
const canonicalConversationPresentedListValidator = v.object({
  kind: canonicalConversationPresentableKindValidator,
  items: v.array(canonicalConversationPresentedListItemValidator),
  source: v.optional(canonicalConversationSourceValidator),
  updatedAt: v.optional(v.number()),
});
const canonicalConversationPendingClarificationValidator = v.object({
  active: v.boolean(),
  source: v.optional(canonicalConversationSourceValidator),
  updatedAt: v.optional(v.number()),
});
const canonicalConversationLatestQueryValidator = v.object({
  text: v.string(),
  status: canonicalConversationQueryStatusValidator,
  source: canonicalConversationSourceValidator,
  updatedAt: v.number(),
});
const canonicalConversationFreshnessValidator = v.object({
  status: canonicalConversationFreshnessStatusValidator,
  updatedAt: v.optional(v.number()),
  activeWindowExpiresAt: v.optional(v.number()),
});
const canonicalConversationSourceOfTruthMarkersValidator = v.object({
  responseLanguage: v.optional(canonicalConversationSourceValidator),
  currentFocus: v.optional(canonicalConversationSourceValidator),
  lastPresentedList: v.optional(canonicalConversationSourceValidator),
  pendingClarification: v.optional(canonicalConversationSourceValidator),
  latestStandaloneQuery: v.optional(canonicalConversationSourceValidator),
});
const canonicalConversationHeuristicCandidateValidator = v.object({
  entityKind: v.union(v.literal("category"), v.literal("product"), v.literal("variant")),
  entityId: v.string(),
  score: v.number(),
});
const canonicalConversationHeuristicHintsValidator = v.object({
  promptHistorySelectionMode: v.optional(promptHistorySelectionModeValidator),
  usedQuotedReference: v.boolean(),
  referencedTransportMessageId: v.optional(v.string()),
  retrievalOutcome: v.optional(retrievalOutcomeValidator),
  topCandidates: v.array(canonicalConversationHeuristicCandidateValidator),
  retrievalOrderListProxy: v.optional(canonicalConversationPresentedListValidator),
  heuristicFocus: v.optional(canonicalConversationFocusValidator),
});
const retrievalModeValidator = v.union(
  v.literal("raw_latest_message"),
  v.literal("semantic_catalog_search"),
  v.literal("direct_entity_lookup"),
  v.literal("variant_lookup"),
  v.literal("filtered_catalog_search"),
  v.literal("skip_retrieval"),
  v.literal("clarification_required"),
);
const turnReferencedEntitySourceValidator = v.union(
  ...TURN_REFERENCED_ENTITY_SOURCE_VALUES.map((source) => v.literal(source)),
);
const assistantSemanticNormalizedActionValidator = v.union(
  ...ASSISTANT_SEMANTIC_NORMALIZED_ACTION_VALUES.map((action) => v.literal(action)),
);
const assistantSemanticRecordStatusValidator = v.union(
  ...ASSISTANT_SEMANTIC_RECORD_STATUS_VALUES.map((status) => v.literal(status)),
);
const assistantSemanticResponseModeValidator = v.union(
  ...ASSISTANT_SEMANTIC_RESPONSE_MODE_VALUES.map((mode) => v.literal(mode)),
);
const turnReferencedEntityValidator = v.object({
  entityKind: v.union(v.literal("category"), v.literal("product"), v.literal("variant")),
  entityId: v.string(),
  source: turnReferencedEntitySourceValidator,
  confidence: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
});
const assistantSemanticDisplayIndexMappingValidator = v.object({
  displayIndex: v.number(),
  entityId: v.string(),
});
const assistantSemanticResolvedStandaloneQueryValidator = v.object({
  text: v.string(),
  status: v.union(v.literal("used"), v.literal("not_used")),
});
const assistantSemanticGroundingSourceMetadataValidator = v.object({
  usedRetrieval: v.boolean(),
  usedConversationState: v.boolean(),
  usedSummary: v.boolean(),
  retrievalMode: v.optional(retrievalModeValidator),
  groundedEntityIds: v.array(v.string()),
});
const assistantSemanticRationaleValidator = v.object({
  reasonCode: v.string(),
  detail: v.optional(v.string()),
});
const assistantSemanticStateMutationHintsValidator = v.object({
  focusKind: v.optional(canonicalConversationFocusKindValidator),
  focusEntityIds: v.array(v.string()),
  shouldSetPendingClarification: v.boolean(),
  latestStandaloneQueryText: v.optional(v.string()),
  lastPresentedList: v.optional(canonicalConversationPresentedListValidator),
});
const conversationSummaryResolvedDecisionValidator = v.object({
  summary: v.string(),
  source: v.optional(v.string()),
});
const conversationSummaryFreshnessValidator = v.object({
  status: canonicalConversationFreshnessStatusValidator,
  updatedAt: v.optional(v.number()),
});
const conversationSummaryProvenanceValidator = v.object({
  source: v.union(v.literal("shadow"), v.literal("system_seed"), v.literal("summary_job")),
  generatedAt: v.optional(v.number()),
});
const conversationSummaryCoveredMessageRangeValidator = v.object({
  fromMessageId: v.optional(v.string()),
  toMessageId: v.optional(v.string()),
  messageCount: v.optional(v.number()),
});
const [
  initializingState,
  connectingState,
  awaitingPairingState,
  openState,
  reconnectingState,
  closedState,
  loggedOutState,
  failedState,
] = BOT_RUNTIME_SESSION_STATES;

const botRuntimeSessionStateValidator = v.union(
  v.literal(initializingState),
  v.literal(connectingState),
  v.literal(awaitingPairingState),
  v.literal(openState),
  v.literal(reconnectingState),
  v.literal(closedState),
  v.literal(loggedOutState),
  v.literal(failedState),
);

export default defineSchema({
  // ── Companies ────────────────────────────────────────────────────────────
  companies: defineTable({
    name: v.string(),
    ownerPhone: v.string(),
    seedKey: v.optional(v.string()),
    config: v.optional(flexRecord),
    timezone: v.optional(v.string()),
    botRuntimePairingLeaseExpiresAt: v.optional(v.number()),
    botRuntimePairingLeaseOwner: v.optional(v.string()),
    botRuntimeSessionLeaseExpiresAt: v.optional(v.number()),
    botRuntimeSessionLeaseOwner: v.optional(v.string()),
  })
    .index("by_owner_phone", ["ownerPhone"])
    .index("by_seed_key", ["seedKey"]),

  jobLocks: defineTable({
    key: v.string(),
    ownerToken: v.string(),
    acquiredAt: v.number(),
    expiresAt: v.number(),
  }).index("by_key", ["key"]),

  botRuntimeSessions: defineTable({
    companyId: v.id("companies"),
    runtimeOwnerId: v.string(),
    sessionKey: v.string(),
    state: botRuntimeSessionStateValidator,
    attempt: v.number(),
    hasQr: v.boolean(),
    disconnectCode: v.optional(v.number()),
    isNewLogin: v.optional(v.boolean()),
    updatedAt: v.number(),
    leaseExpiresAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_runtime_owner", ["runtimeOwnerId"])
    .index("by_state", ["state"])
    .index("by_lease_expires_at", ["leaseExpiresAt"]),

  botRuntimePairingArtifacts: defineTable({
    companyId: v.id("companies"),
    runtimeOwnerId: v.string(),
    sessionKey: v.string(),
    qrText: v.string(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_runtime_owner", ["runtimeOwnerId"])
    .index("by_expires_at", ["expiresAt"]),

  // ── Categories ──────────────────────────────────────────────────────────
  categories: defineTable({
    companyId: v.id("companies"),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_company_name_en", ["companyId", "nameEn"]),

  // ── Products ────────────────────────────────────────────────────────────
  products: defineTable({
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
    revision: v.optional(v.number()),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    specifications: v.optional(flexRecord),
    basePrice: v.optional(v.number()),
    baseCurrency: v.optional(v.string()), // Default: "SAR"
    images: v.optional(v.array(productImageValidator)),
  })
    .index("by_company", ["companyId"])
    .index("by_category", ["companyId", "categoryId"]),

  productImageUploads: defineTable({
    companyId: v.id("companies"),
    productId: v.id("products"),
    imageId: v.string(),
    objectKey: v.string(),
    intendedContentType: v.string(),
    maxSizeBytes: v.number(),
    alt: v.optional(v.string()),
    status: productImageUploadStatusValidator,
    expiresAt: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_product", ["productId"])
    .index("by_status_expires_at", ["status", "expiresAt"]),

  mediaCleanupJobs: defineTable({
    companyId: v.id("companies"),
    productId: v.optional(v.id("products")),
    imageId: v.optional(v.string()),
    objectKey: v.string(),
    reason: v.string(),
    status: mediaCleanupStatusValidator,
    attempts: v.number(),
    nextAttemptAt: v.number(),
    leaseExpiresAt: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_status_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_lease_expires_at", ["status", "leaseExpiresAt"])
    .index("by_object_key", ["objectKey"]),

  // ── Product Variants ────────────────────────────────────────────────────
  productVariants: defineTable({
    productId: v.id("products"),
    variantLabel: v.string(),
    attributes: v.record(v.string(), v.any()),
    priceOverride: v.optional(v.number()),
  }).index("by_product", ["productId"]),

  // ── Embeddings (with vector index) ──────────────────────────────────────
  embeddings: defineTable({
    companyId: v.id("companies"),
    productId: v.id("products"),
    embedding: v.array(v.float64()),
    textContent: v.string(),
    language: v.optional(v.string()),
    companyLanguage: v.string(),
  })
    .index("by_company", ["companyId"])
    .index("by_product", ["productId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768, // Gemini embedding size
      filterFields: ["companyLanguage"],
    }),

  // ── Conversations ───────────────────────────────────────────────────────
  conversations: defineTable({
    companyId: v.id("companies"),
    phoneNumber: v.string(),
    muted: v.boolean(), // Default: false
    mutedAt: v.optional(v.number()),
    handoffSeedTimestamp: v.optional(v.number()),
    lastCustomerMessageAt: v.optional(v.number()),
    nextAutoResumeAt: v.optional(v.number()),
  })
    .index("by_company_phone", ["companyId", "phoneNumber"])
    .index("by_company_phone_and_muted", ["companyId", "phoneNumber", "muted"])
    .index("by_muted_next_auto_resume_at", ["muted", "nextAutoResumeAt"]),

  conversationStateEvents: defineTable({
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    phoneNumber: v.string(),
    eventType: conversationStateEventTypeValidator,
    timestamp: v.number(),
    source: conversationStateEventSourceValidator,
    reason: v.optional(v.string()),
    actorPhoneNumber: v.optional(v.string()),
    metadata: v.optional(flexRecord),
  })
    .index("by_conversation_time", ["conversationId", "timestamp"])
    .index("by_company_time", ["companyId", "timestamp"]),

  conversationCanonicalStates: defineTable({
    conversationId: v.id("conversations"),
    companyId: v.id("companies"),
    schemaVersion: v.literal("v1"),
    responseLanguage: v.optional(v.union(v.literal("ar"), v.literal("en"))),
    currentFocus: canonicalConversationFocusValidator,
    lastPresentedList: v.optional(canonicalConversationPresentedListValidator),
    pendingClarification: canonicalConversationPendingClarificationValidator,
    latestStandaloneQuery: v.optional(canonicalConversationLatestQueryValidator),
    freshness: canonicalConversationFreshnessValidator,
    sourceOfTruthMarkers: canonicalConversationSourceOfTruthMarkersValidator,
    heuristicHints: canonicalConversationHeuristicHintsValidator,
  })
    .index("by_conversation", ["conversationId"])
    .index("by_company_conversation", ["companyId", "conversationId"]),

  assistantSemanticRecords: defineTable({
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    assistantMessageId: v.id("messages"),
    schemaVersion: v.literal("v1"),
    actionType: v.union(v.literal("none"), v.literal("clarify"), v.literal("handoff")),
    normalizedAction: assistantSemanticNormalizedActionValidator,
    semanticRecordStatus: assistantSemanticRecordStatusValidator,
    presentedNumberedList: v.boolean(),
    orderedPresentedEntityIds: v.array(v.string()),
    displayIndexToEntityIdMap: v.array(assistantSemanticDisplayIndexMappingValidator),
    presentedList: v.optional(canonicalConversationPresentedListValidator),
    referencedEntities: v.array(turnReferencedEntityValidator),
    resolvedStandaloneQueryUsed: v.optional(assistantSemanticResolvedStandaloneQueryValidator),
    responseLanguage: v.optional(v.union(v.literal("ar"), v.literal("en"))),
    responseMode: assistantSemanticResponseModeValidator,
    groundingSourceMetadata: assistantSemanticGroundingSourceMetadataValidator,
    handoffRationale: v.optional(assistantSemanticRationaleValidator),
    clarificationRationale: v.optional(assistantSemanticRationaleValidator),
    stateMutationHints: assistantSemanticStateMutationHintsValidator,
    createdAt: v.number(),
  })
    .index("by_assistant_message", ["assistantMessageId"])
    .index("by_conversation_created_at", ["conversationId", "createdAt"])
    .index("by_company_conversation_created_at", ["companyId", "conversationId", "createdAt"]),

  conversationSummaries: defineTable({
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    summaryId: v.string(),
    durableCustomerGoal: v.optional(v.string()),
    stablePreferences: v.array(v.string()),
    importantResolvedDecisions: v.array(conversationSummaryResolvedDecisionValidator),
    historicalContextNeededForFutureTurns: v.array(v.string()),
    freshness: conversationSummaryFreshnessValidator,
    freshnessUpdatedAt: v.number(),
    provenance: conversationSummaryProvenanceValidator,
    coveredMessageRange: conversationSummaryCoveredMessageRangeValidator,
  })
    .index("by_conversation_updated_at", ["conversationId", "freshnessUpdatedAt"])
    .index("by_company_conversation_updated_at", ["companyId", "conversationId", "freshnessUpdatedAt"])
    .index("by_conversation_summary_id", ["conversationId", "summaryId"]),

  // ── Messages ────────────────────────────────────────────────────────────
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    timestamp: v.number(),
    deliveryState: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))),
    providerAcknowledgedAt: v.optional(v.number()),
    sideEffectsState: v.optional(v.union(v.literal("pending"), v.literal("completed"))),
    ownerNotificationState: v.optional(v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("completed"),
      v.literal("not_applicable"),
    )),
    analyticsState: v.optional(v.union(
      v.literal("pending"),
      v.literal("recorded"),
      v.literal("completed"),
      v.literal("not_applicable"),
    )),
    transportMessageId: v.optional(v.string()),
    referencedTransportMessageId: v.optional(v.string()),
    handoffSource: v.optional(v.union(
      v.literal("assistant_action"),
      v.literal("provider_failure_fallback"),
      v.literal("invalid_model_output_fallback"),
    )),
    handoffReason: v.optional(v.string()),
    handoffActorPhoneNumber: v.optional(v.string()),
    handoffMetadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_time", ["conversationId", "timestamp"])
    .index("by_conversation_transport_message_id", ["conversationId", "transportMessageId"])
    .index("by_role_delivery_state_time", ["role", "deliveryState", "timestamp"])
    .index("by_role_delivery_ack_time", ["role", "deliveryState", "providerAcknowledgedAt"]),

  // ── Offers ──────────────────────────────────────────────────────────────
  offers: defineTable({
    companyId: v.id("companies"),
    contentEn: v.string(),
    contentAr: v.optional(v.string()),
    active: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  }).index("by_company_active", ["companyId", "active"]),

  // ── Currency Rates ──────────────────────────────────────────────────────
  currencyRates: defineTable({
    companyId: v.id("companies"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_pair", ["companyId", "fromCurrency", "toCurrency"]),

  // ── Analytics Events ────────────────────────────────────────────────────
  analyticsEvents: defineTable({
    companyId: v.id("companies"),
    eventType: v.string(),
    timestamp: v.number(),
    idempotencyKey: v.optional(v.string()),
    payload: v.optional(flexRecord),
  })
    .index("by_company_type", ["companyId", "eventType"])
    .index("by_company_type_idempotency_key", ["companyId", "eventType", "idempotencyKey"])
    .index("by_company_type_time", ["companyId", "eventType", "timestamp"]),
});
