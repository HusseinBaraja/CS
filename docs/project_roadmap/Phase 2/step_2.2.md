### Step 2.2: Convex Schema Definition
**Goal**: Define the full schema using Convex's `defineSchema` and `defineTable`.

**Tasks**:
- [ ] Create `convex/schema.ts` with all tables:

**Companies Table**:
```typescript
companies: defineTable({
	name: v.string(),
	ownerPhone: v.string(),
	config: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
	timezone: v.optional(v.string()),
}).index("by_owner_phone", ["ownerPhone"]),
```


**Categories Table**:
```typescript
categories: defineTable({
	companyId: v.id("companies"),
	nameEn: v.string(),
	nameAr: v.optional(v.string()),
	descriptionEn: v.optional(v.string()),
	descriptionAr: v.optional(v.string()),
}).index("by_company", ["companyId"]),
```

**Products Table**:
```typescript
products: defineTable({
	companyId: v.id("companies"),
	categoryId: v.id("categories"),
	nameEn: v.string(),
	nameAr: v.optional(v.string()),
	descriptionEn: v.optional(v.string()),
	descriptionAr: v.optional(v.string()),
	specifications: v.optional(v.record(v.string(), v.union(v.string(),v.number(), v.boolean()))),
	basePrice: v.optional(v.number()),
	baseCurrency: v.optional(v.string()), // Default: "SAR"
	imageUrls: v.optional(v.array(v.string())), // Cloudflare R2 public URLs
}).index("by_company", ["companyId"])
.index("by_category", ["companyId", "categoryId"]),
```


**Product Variants Table**:
```typescript
productVariants: defineTable({
productId: v.id("products"),
variantLabel: v.string(),
attributes: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())), // { size: "L", color: "White" }
priceOverride: v.optional(v.number()),
}).index("by_product", ["productId"]),
```


> [!NOTE]

> Variants inherit company scope through their parent product. Variant endpoints must validate company ownership via a join through `products`.



**Embeddings Table** (with vector index):
```typescript
embeddings: defineTable({
	companyId: v.id("companies"),
	productId: v.id("products"),
	embedding: v.array(v.float64()),
	textContent: v.string(),
	language: v.optional(v.string()),
})
.index("by_company", ["companyId"])
.index("by_product", ["productId"])
.vectorIndex("by_embedding", {
  vectorField: "embedding",
  dimensions: 768,  // Gemini embedding size
  filterFields: ["companyId", "language"],
}),
```

**Conversations Table**:
```typescript
conversations: defineTable({
companyId: v.id("companies"),
phoneNumber: v.string(),
muted: v.optional(v.boolean()),  // Default: false
mutedAt: v.optional(v.number()),
})
.index("by_company_phone", ["companyId", "phoneNumber"]),

```

**Messages Table** (separate from conversations for scalability):
```typescript
messages: defineTable({
	conversationId: v.id("conversations"),
	role: v.union(v.literal("user"), v.literal("assistant")),
	content: v.string(),
	timestamp: v.number(),
})
.index("by_conversation", ["conversationId"])
.index("by_conversation_time", ["conversationId", "timestamp"]),
```

**Offers Table**:
```typescript
offers: defineTable({
	companyId: v.id("companies"),
	contentEn: v.string(),
	contentAr: v.optional(v.string()),
	active: v.optional(v.boolean()),  // Default: true
	startDate: v.optional(v.number()),
	endDate: v.optional(v.number()),
})
.index("by_company_active", ["companyId", "active"]),
```

**Currency Rates Table**:
```typescript
currencyRates: defineTable({
	companyId: v.id("companies"),
	fromCurrency: v.string(),
	toCurrency: v.string(),
	rate: v.number(),

})
.index("by_company", ["companyId"])
.index("by_company_pair", ["companyId", "fromCurrency", "toCurrency"]),
```

**Analytics Events Table**:
```typescript
analyticsEvents: defineTable({
	companyId: v.id("companies"),
	eventType: v.string(),
	payload: v.optional(v.any()),
}).index("by_company_type", ["companyId", "eventType"]),
```

- [ ] Run `npx convex dev` to push schema to deployment

**Verification**:
- All tables visible in Convex Dashboard
- Indexes created (including vector index on embeddings)
- Document references (`v.id()`) validated on insert
- Schema types auto-generated in `convex/_generated/`

**Tests**:
- Schema push runs without errors
- Insert documents with valid references → success
- Insert documents with invalid references → rejected