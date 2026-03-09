import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// ── Reusable field patterns ──────────────────────────────────────────────────
const flexRecord = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);

export default defineSchema({
  // ── Companies ────────────────────────────────────────────────────────────
  companies: defineTable({
    name: v.string(),
    ownerPhone: v.string(),
    seedKey: v.optional(v.string()),
    config: v.optional(flexRecord),
    timezone: v.optional(v.string()),
  })
    .index("by_owner_phone", ["ownerPhone"])
    .index("by_seed_key", ["seedKey"]),

  jobLocks: defineTable({
    key: v.string(),
    ownerToken: v.string(),
    acquiredAt: v.number(),
    expiresAt: v.number(),
  }).index("by_key", ["key"]),

  // ── Categories ──────────────────────────────────────────────────────────
  categories: defineTable({
    companyId: v.id("companies"),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
  }).index("by_company", ["companyId"]),

  // ── Products ────────────────────────────────────────────────────────────
  products: defineTable({
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    specifications: v.optional(flexRecord),
    basePrice: v.optional(v.number()),
    baseCurrency: v.optional(v.string()), // Default: "SAR"
    imageUrls: v.optional(v.array(v.string())), // Cloudflare R2 public URLs
  })
    .index("by_company", ["companyId"])
    .index("by_category", ["companyId", "categoryId"]),

  // ── Product Variants ────────────────────────────────────────────────────
  productVariants: defineTable({
    productId: v.id("products"),
    variantLabel: v.string(),
    attributes: flexRecord, // e.g. { size: "L", color: "White" }
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
