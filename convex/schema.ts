import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  BOT_RUNTIME_SESSION_STATES,
  CONVERSATION_STATE_EVENT_SOURCES,
  CONVERSATION_STATE_EVENT_TYPES,
} from '@cs/shared';
import { catalogLanguageHintsValidator } from './catalogLanguageHints';

// ── Reusable field patterns ──────────────────────────────────────────────────
const flexRecord = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);
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
  ...CONVERSATION_STATE_EVENT_TYPES.map((eventType) => v.literal(eventType)),
);
const conversationStateEventSourceValidator = v.union(
  ...CONVERSATION_STATE_EVENT_SOURCES.map((source) => v.literal(source)),
);
const MESSAGE_HANDOFF_SOURCES = [
  "assistant_action",
  "provider_failure_fallback",
  "invalid_model_output_fallback",
] as const;
const messageHandoffSourceValidator = v.union(
  ...MESSAGE_HANDOFF_SOURCES.map((source) => v.literal(source)),
);
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

const missingPricePolicyValidator = v.union(
  v.literal("reply_unavailable"),
  v.literal("handoff"),
);

export default defineSchema({
  // ── Companies ────────────────────────────────────────────────────────────
  companies: defineTable({
    name: v.string(),
    ownerPhone: v.string(),
    seedKey: v.optional(v.string()),
    config: v.optional(flexRecord),
    timezone: v.optional(v.string()),
    catalogLanguageHints: v.optional(catalogLanguageHintsValidator),
    botRuntimePairingLeaseExpiresAt: v.optional(v.number()),
    botRuntimePairingLeaseOwner: v.optional(v.string()),
    botRuntimeSessionLeaseExpiresAt: v.optional(v.number()),
    botRuntimeSessionLeaseOwner: v.optional(v.string()),
  })
    .index("by_owner_phone", ["ownerPhone"])
    .index("by_seed_key", ["seedKey"]),

  // ── Company Settings ────────────────────────────────────────────────────
  companySettings: defineTable({
    companyId: v.id("companies"),
    missingPricePolicy: missingPricePolicyValidator,
  })
    .index("by_company", ["companyId"]),

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
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    nameKey: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_company_name_key", ["companyId", "nameKey"])
    .index("by_company_name_en", ["companyId", "nameEn"])
    .index("by_company_name_ar", ["companyId", "nameAr"]),

  // ── Products ────────────────────────────────────────────────────────────
  products: defineTable({
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
    productNo: v.optional(v.string()),
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    primaryImage: v.optional(v.string()),
    version: v.optional(v.number()),
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
    observedContentType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    etag: v.optional(v.string()),
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
    companyId: v.id("companies"),
    productId: v.id("products"),
    label: v.string(),
    price: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_product", ["productId"]),

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

  // ── Messages ────────────────────────────────────────────────────────────
  messages: defineTable({
    companyId: v.id("companies"),
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
    handoffSource: v.optional(messageHandoffSourceValidator),
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
