import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { BOT_RUNTIME_SESSION_STATES } from '@cs/shared';

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
  }).index("by_company_phone_and_muted", ["companyId", "phoneNumber", "muted"]),

  // ── Messages ────────────────────────────────────────────────────────────
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    timestamp: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_time", ["conversationId", "timestamp"]),

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
    payload: v.optional(flexRecord),
  })
    .index("by_company_type", ["companyId", "eventType"])
    .index("by_company_type_time", ["companyId", "eventType", "timestamp"]),
});
