# CSCB Project — Checklist

> Mark tasks with `[x]` as you complete them. Refer to [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for full details, code snippets, and specs.
> Monorepo baseline and path mapping: [`MONOREPO_SETUP.md`](./MONOREPO_SETUP.md).

---

## Phase 1: Project Foundation & Basic Setup

### Step 1.1 — Project Structure Setup

- [ ] Create the folder structure (`src/config`, `src/providers`, `src/services/whatsapp`, `src/services/ai`, `src/services/rag`, `src/controllers`, `src/commands`, `src/api/middleware`, `src/api/routes`, `src/utils`, `convex/`, `tests/unit`, `tests/integration`, `docs/`)
- [ ] Create `src/index.ts` as the main entry point
- [ ] Initialize `package.json` with `bun init`
- [ ] Configure `tsconfig.json` with strict mode enabled
- [ ] Create `.gitignore` (node_modules, .env, logs/, data/, auth_sessions/, .convex/, dist/, coverage/)
- [ ] Install dev tooling: `bun add -d typescript bun-types vitest oxlint prettier turbo convex`
- [ ] Configure Oxlint (`oxlintrc.json`) — type-aware linting
- [ ] Configure Prettier (`.prettierrc` + `.prettierignore`)
- [ ] Configure Vitest (`vitest.config.ts`) with path aliases and globals
- [ ] Create `convex/tsconfig.json` for Convex server functions
- [ ] Configure Turborepo (`turbo.json`) — task caching, dependencies, and parallelization
- [ ] Set up all package.json scripts:
  - `bun dev` — Start dev server (Vite + Convex via turbo)
  - `bun lint` — Type-aware Oxlint linting (also reports TypeScript errors)
  - `bun lint --fix` — Apply fixes for autofixable lint issues
  - `bun check` — Runs format & lint
  - `bun test` — Run tests with Vitest (excludes evals)
  - `bun test:watch` — Watch mode for tests
  - `bun x vitest run path/to/test.test.ts` — Run single test file
  - `bun generate` — Generate Convex types after schema changes
  - `bun run typecheck` — `tsc --noEmit`
  - `bun run ci` — Full CI: typecheck + lint + test (via turbo, cached)
- [ ] **Verify**: `bun run src/index.ts` starts without errors
- [ ] **Verify**: `bun run typecheck` passes with zero errors
- [ ] **Verify**: `bun lint` runs without configuration errors
- [ ] **Verify**: `bun run ci` passes
- [ ] **Test**: Smoke test — app boots and exits cleanly

### Step 1.2 — Environment Configuration

- [ ] Install `@t3-oss/env-core` and `zod`
- [ ] Create `src/config/env.ts` with type-safe env validation
- [ ] Validate required env vars on startup with clear error messages
- [ ] Add default values for optional settings
- [ ] Create `.env.example` template file
- [ ] **Test**: Missing required var → throws `ConfigError`
- [ ] **Test**: Invalid value (wrong enum) → throws with validation message
- [ ] **Test**: Defaults applied when optional vars missing

### Step 1.3 — Logging System

- [ ] Install `pino` and `pino-pretty`
- [ ] Create `src/utils/logger.ts`
- [ ] Configure log levels based on environment (dev = debug, prod = info)
- [ ] Add pretty-printing for development
- [ ] Add log file output for production
- [ ] Implement sensitive data redaction (phone numbers, API keys)
- [ ] **Test**: Logger outputs at correct levels
- [ ] **Test**: Redaction strips sensitive fields

### Step 1.4 — Error Handling System

- [ ] Create `src/utils/errors.ts` with custom error classes
- [ ] Create error types: `ConfigError`, `DatabaseError`, `AIError`, `WhatsAppError`, `AuthError`, `ValidationError`
- [ ] Add error formatting utilities (structured JSON for logging)
- [ ] Add error code constants
- [ ] **Test**: Each error type serializes correctly
- [ ] **Test**: Error hierarchy works (instanceof checks)

### Step 1.5 — PM2 Configuration

- [ ] Install `pm2` globally
- [ ] Create `ecosystem.config.js` (auto-restart, max memory threshold, log paths, watch mode)
- [ ] Create PM2 npm scripts: `start`, `stop`, `logs` (dev script handled by concurrently in Step 1.1)
- [ ] **Verify**: `pm2 start ecosystem.config.js` launches the app
- [ ] **Verify**: App auto-restarts after a crash
- [ ] **Verify**: Logs accessible via `pm2 logs`

---

## Phase 2: Convex Backend Layer

### Step 2.1 — Convex Project Setup

- [ ] Install `convex` package
- [ ] Run `npx convex dev` to initialize the `convex/` directory
- [ ] Create a Convex project (free tier) via the CLI
- [ ] Verify `convex/` directory created with `_generated/` types
- [ ] Add `CONVEX_URL` to `.env` (auto-populated by CLI)
- [ ] Create `convex/helpers.ts` for shared utility functions
- [ ] **Verify**: `npx convex dev` connects to deployment successfully
- [ ] **Verify**: Dashboard accessible at `dashboard.convex.dev`
- [ ] **Test**: Convex client connects and responds to a simple query

### Step 2.2 — Convex Schema Definition

- [ ] Create `convex/schema.ts` with the `companies` table (name, ownerPhone, config, timezone + index)
- [ ] Add `categories` table (companyId, nameEn, nameAr, descriptions + index)
- [ ] Add `products` table (companyId, categoryId, names, descriptions, specs, price, currency, imageUrls + indexes)
- [ ] Add `productVariants` table (productId, variantLabel, attributes, priceOverride + index)
- [ ] Add `embeddings` table with vector index (companyId, productId, embedding, textContent, language + indexes + vectorIndex)
- [ ] Add `conversations` table (companyId, phoneNumber, muted, mutedAt + index)
- [ ] Add `messages` table (conversationId, role, content, timestamp + indexes)
- [ ] Add `offers` table (companyId, contentEn, contentAr, active, startDate, endDate + index)
- [ ] Add `currencyRates` table (companyId, fromCurrency, toCurrency, rate + indexes)
- [ ] Add `analyticsEvents` table (companyId, eventType, payload + index)
- [ ] Run `npx convex dev` to push schema to deployment
- [ ] **Verify**: All tables visible in Convex Dashboard
- [ ] **Verify**: Indexes created (including vector index on embeddings)
- [ ] **Test**: Insert documents with valid references → success
- [ ] **Test**: Insert documents with invalid references → rejected

### Step 2.3 — Sample Data Seeder

- [ ] Create `convex/seed.ts` as a Convex mutation
- [ ] Seed a sample company ("Demo Packaging Co")
- [ ] Seed 4–5 categories (Containers, Cups, Plates, Bags, Cutlery)
- [ ] Seed 15–20 products with bilingual names, descriptions, specs, and prices
- [ ] Seed 2–3 variants per product where applicable
- [ ] Seed 2 active offers
- [ ] Seed currency rate (SAR → YER at 425)
- [ ] Create a runner script to call the seed mutation
- [ ] **Verify**: Seed mutation populates all tables (visible in Dashboard)
- [ ] **Test**: Seed runs idempotently (clears existing data before re-seeding)

### Step 2.4 — Data Export / Backup

- [ ] Document how to use Convex Dashboard's snapshot export feature
- [ ] Create a script using Convex's export API for automated backups
- [ ] Save exports to a local `backups/` directory with timestamps
- [ ] Add retention policy (keep last N exports)
- [ ] **Verify**: Export produces a complete snapshot of all tables
- [ ] **Verify**: Export can be imported to a fresh Convex deployment

---

## Phase 3: REST API

### Step 3.1 — Hono Server Setup

- [ ] Install `hono`
- [ ] Create `src/api/server.ts` — Hono app initialization
- [ ] Create `src/api/middleware/auth.ts` — API key authentication
- [ ] Create `src/api/middleware/rateLimit.ts` — request rate limiting
- [ ] Configure CORS
- [ ] Configure JSON body parsing
- [ ] Start on configurable port (default 3000)
- [ ] **Verify**: `GET /api/health` responds with status
- [ ] **Test**: Health endpoint returns 200
- [ ] **Test**: Missing auth header returns 401
- [ ] **Test**: Invalid API key returns 403

### Step 3.2 — Company Endpoints

- [ ] Create `src/api/routes/companies.ts`
- [ ] Implement `GET /api/companies` — list all companies
- [ ] Implement `GET /api/companies/:companyId` — get single company
- [ ] Implement `POST /api/companies` — register new company
- [ ] Implement `PUT /api/companies/:companyId` — update company config
- [ ] Implement `DELETE /api/companies/:companyId` — delete company (cascades)
- [ ] **Test**: CRUD lifecycle test
- [ ] **Test**: Cascade delete removes products, conversations, etc.
- [ ] **Test**: Validation rejects invalid input

### Step 3.3 — Category Endpoints

- [ ] Create `src/api/routes/categories.ts`
- [ ] Implement `GET /api/companies/:companyId/categories` — list categories
- [ ] Implement `GET /api/companies/:companyId/categories/:id` — get single
- [ ] Implement `POST /api/companies/:companyId/categories` — create
- [ ] Implement `PUT /api/companies/:companyId/categories/:id` — update
- [ ] Implement `DELETE /api/companies/:companyId/categories/:id` — delete (fail if products exist)
- [ ] **Test**: Full CRUD cycle
- [ ] **Test**: Delete with products → 409 conflict

### Step 3.4 — Product Endpoints

- [ ] Create `src/api/routes/products.ts`
- [ ] Implement `GET /api/companies/:companyId/products` — list with `?categoryId` and `?search` filters
- [ ] Implement `GET /api/companies/:companyId/products/:id` — get with variants included
- [ ] Implement `POST /api/companies/:companyId/products` — create (auto-generate embeddings)
- [ ] Implement `PUT /api/companies/:companyId/products/:id` — update (re-generate embeddings)
- [ ] Implement `DELETE /api/companies/:companyId/products/:id` — delete (cascades embeddings + variants + R2 images)
- [ ] **Test**: CRUD lifecycle
- [ ] **Test**: Filter by category
- [ ] **Test**: Embedding auto-generation on create/update

### Step 3.5 — Product Variant Endpoints

- [ ] Add variant routes to `src/api/routes/products.ts` (or separate `variants.ts`)
- [ ] Implement `GET .../products/:productId/variants` — list
- [ ] Implement `POST .../products/:productId/variants` — create
- [ ] Implement `PUT .../variants/:id` — update (enforce company match via join)
- [ ] Implement `DELETE .../variants/:id` — delete (enforce company match via join)
- [ ] **Test**: Create variant with simple attributes → success
- [ ] **Test**: Create variant with complex attributes → success

### Step 3.6 — Offers & Currency Rate Endpoints

- [ ] Create `src/api/routes/offers.ts` (GET list, POST create, PUT update, DELETE)
- [ ] Implement offers listing with active-only default and `?all=true` flag
- [ ] Create `src/api/routes/currencyRates.ts` (GET list, PUT upsert)
- [ ] **Test**: Create offer with start/end dates
- [ ] **Test**: Rate upsert (insert if not exists, update if exists)

### Step 3.7 — Analytics Endpoint

- [ ] Create `src/api/routes/analytics.ts`
- [ ] Implement `GET /api/companies/:companyId/analytics?period=today|week|month`
- [ ] Aggregate from `analyticsEvents` table (conversations, searches, image requests, handoffs, response time, top products)
- [ ] Return as structured JSON
- [ ] **Test**: Empty data → returns zeros
- [ ] **Test**: Seeded data → returns correct counts

### Step 3.8 — Image Upload Endpoint

- [ ] Install `@aws-sdk/client-s3`
- [ ] Create `src/services/r2.ts` — R2 client setup using S3-compatible API
- [ ] Implement `POST /api/companies/:companyId/products/:productId/images` (multipart/form-data)
- [ ] Upload to R2 bucket under key `{companyId}/{productId}/{uuid}.{ext}`
- [ ] Append the R2 public URL to product's `imageUrls` array
- [ ] Validate file type (JPEG, PNG, WebP only)
- [ ] Implement `DELETE .../images/:index` to remove single image
- [ ] On product delete, handle image cleanups asynchronously (Convex cron or background task)
- [ ] **Test**: Upload valid image → 201
- [ ] **Test**: Upload invalid file type → 400
- [ ] **Test**: Delete product → R2 objects scheduled for async removal

---

## Phase 4: AI Provider System

### Step 4.1 — Provider Interface & Types

- [ ] Create `src/providers/types.ts` with `AIProvider`, `ChatMessage`, `ChatOptions`, `ChatResponse` interfaces
- [ ] **Verify**: Types compile without errors and are importable from anywhere

### Step 4.2 — DeepSeek Provider

- [ ] Install `openai` package
- [ ] Create `src/providers/deepseek.ts`
- [ ] Configure with DeepSeek base URL and API key
- [ ] Implement `chat()` with timeout and retry logic
- [ ] Implement `isAvailable()` health check
- [ ] **Test**: Mock API → successful response parsed correctly
- [ ] **Test**: Mock API → timeout triggers retry
- [ ] **Test**: `isAvailable()` returns true/false correctly

### Step 4.3 — Gemini Provider

- [ ] Install `@google/genai`
- [ ] Create `src/providers/gemini.ts`
- [ ] Use Gemini Flash model for fast, cheap responses
- [ ] Implement same `AIProvider` interface
- [ ] Handle Gemini-specific response format
- [ ] **Test**: Mock API → response parsed correctly
- [ ] **Test**: Error handling works

### Step 4.4 — Groq Provider

- [ ] Install `groq-sdk`
- [ ] Create `src/providers/groq.ts`
- [ ] Use Llama 3.1 8B model
- [ ] Implement same `AIProvider` interface
- [ ] **Test**: Mock API → response parsed correctly

### Step 4.5 — Provider Manager with Failover

- [ ] Create `src/providers/index.ts`
- [ ] Implement `ProviderManager` — load active provider, failover chain: DeepSeek → Gemini → Groq → throw `AIError`
- [ ] Log every failover event
- [ ] Export factory function: `createProviderManager(config)`
- [ ] **Test**: Primary succeeds → uses primary
- [ ] **Test**: Primary fails → falls back to secondary
- [ ] **Test**: All fail → throws `AIError`
- [ ] **Test**: Failover logged

### Step 4.6 — System Prompts & Language Detection

- [ ] Create `src/services/ai/prompts.ts` (persona, language rules, topic boundaries, hallucination prevention, action markers, price negotiation)
- [ ] Create `src/utils/language.ts` — detect Arabic via Unicode ranges, default to English for mixed
- [ ] **Test**: Pure Arabic → `ar`
- [ ] **Test**: Pure English → `en`
- [ ] **Test**: Mixed → `en` (default)
- [ ] **Test**: Numbers only → `en`

---

## Phase 5: RAG Pipeline

### Step 5.1 — Gemini Embedding Service

- [ ] Create `src/services/rag/embeddings.ts`
- [ ] Use `gemini-embedding-001` model (768 dimensions)
- [ ] Implement `generateEmbedding(text)` and `generateBatchEmbeddings(texts)`
- [ ] Add retry logic and error handling
- [ ] Add in-memory LRU cache for query embeddings
- [ ] Implement 2 backup embedding providers (no text fallback)
- [ ] **Test**: Mock API → correct 768-dimension output
- [ ] **Test**: Empty string → handled gracefully

### Step 5.2 — Product Embedding Generation

- [ ] Create embedding text template (combine name + description + specs per language)
- [ ] Generate embeddings for both Arabic and English versions of each product
- [ ] Store in Convex `embeddings` table via mutation, scoped by `companyId`
- [ ] Create a Convex action to regenerate all embeddings
- [ ] Hook into product create/update API to auto-regenerate
- [ ] **Test**: New product → 2 embeddings created
- [ ] **Test**: Updated product → old embeddings replaced

### Step 5.3 — Vector Search Service

- [ ] Create `src/services/rag/vectorSearch.ts`
- [ ] Implement `search(query, companyId, limit?)` — embed query, call Convex vector search, filter by companyId, return ranked matches
- [ ] Filter by similarity threshold on `_score` (default 0.3)
- [ ] **Verify**: "food containers" finds relevant container products
- [ ] **Verify**: Arabic queries match Arabic product descriptions
- [ ] **Test**: Mock embedding → correct Convex vector search call
- [ ] **Test**: Threshold filters low-relevance results

### Step 5.4 — RAG Context Builder

- [ ] Create `src/services/rag/context.ts`
- [ ] Format product data into readable context (name, description, specs, price with currency conversion, variants)
- [ ] Limit context size to stay within token limits
- [ ] Include "no products found" signal when search returns empty
- [ ] **Test**: Products with variants → variants listed
- [ ] **Test**: Currency conversion applied correctly
- [ ] **Test**: Empty search → appropriate message

### Step 5.5 — RAG-Enhanced AI Responses

- [ ] Create `src/services/ai/chat.ts` — the main orchestrator
- [ ] Implement pipeline: detect language → vector search → build context → assemble messages → call AI → return response with actions
- [ ] Handle "no results found" gracefully
- [ ] **Verify**: Product questions answered with real data from RAG
- [ ] **Verify**: Off-topic questions politely refused
- [ ] **Test**: Product query with matches → contextual response
- [ ] **Test**: Product query with no matches → graceful fallback
- [ ] **Test**: Off-topic → refusal response

---

## Phase 6: WhatsApp Integration

### Step 6.1 — Baileys Client Setup

- [ ] Install `@whiskeysockets/baileys`
- [ ] Create `src/services/whatsapp/client.ts`
- [ ] Configure with multi-device mode
- [ ] Persist auth state to `auth_sessions/{companyId}/`
- [ ] Handle connection events: `open`, `close`, `connecting`
- [ ] **Verify**: QR code displays in terminal
- [ ] **Verify**: After scanning, bot connects successfully
- [ ] **Verify**: Session persists across restarts
- [ ] **Test**: Connection state machine transitions correctly

### Step 6.2 — Multi-Session Management

- [ ] Create `src/services/whatsapp/session.ts`
- [ ] Implement `SessionManager` (start, stop, get, list sessions)
- [ ] Store session metadata in database
- [ ] On app startup, reconnect all previously active sessions
- [ ] **Verify**: Multiple sessions can run simultaneously
- [ ] **Test**: Start/stop session lifecycle
- [ ] **Test**: Company isolation (messages routed to correct company)

### Step 6.3 — QR Code Handling

- [ ] Create `src/services/whatsapp/qr.ts`
- [ ] Display QR code in terminal using ANSI art
- [ ] Save QR code as image to `data/qr/{companyId}.png`
- [ ] Expose QR via API: `GET /api/companies/:companyId/qr` (returns image)
- [ ] **Verify**: QR displays in terminal and is accessible via API

### Step 6.4 — Message Receiving & Routing

- [ ] Create `src/controllers/message.ts`
- [ ] Listen to Baileys `messages.upsert` event
- [ ] Extract: sender number, message body, message type, quoted message
- [ ] Ignore: group messages, status updates, own messages
- [ ] Ignore: messages received while offline (check timestamp vs. boot time)
- [ ] Route `!` prefix → command handler
- [ ] Route text messages → AI handler
- [ ] Route media messages → polite decline
- [ ] Log all incoming messages
- [ ] **Test**: Route text to AI handler
- [ ] **Test**: Route `!` command to command handler
- [ ] **Test**: Skip group messages
- [ ] **Test**: Skip offline messages

### Step 6.5 — Message Sending

- [ ] Add `sendText()` and `sendImage()` to `src/controllers/message.ts`
- [ ] Handle message queuing to prevent WhatsApp rate limiting
- [ ] Add typing indicator (`composing` presence) before responding
- [ ] Simulate natural delay (1–3 seconds) before sending
- [ ] **Test**: Send text → message delivered
- [ ] **Test**: Send image with caption → delivered

### Step 6.6 — Access Control

- [ ] Create `src/services/accessControl.ts`
- [ ] Implement modes: `OWNER_ONLY`, `SINGLE_NUMBER`, `LIST`, `ALL`
- [ ] Check authorization before processing any message
- [ ] Identify owner for admin commands
- [ ] **Test**: Each mode tested with authorized and unauthorized numbers

### Step 6.7 — Per-User Rate Limiting

- [ ] Create `src/services/rateLimiter.ts`
- [ ] Implement per-phone-number rate limiting (default: 3s interval)
- [ ] Queue messages that exceed limit (don't drop)
- [ ] Track via in-memory Map (reset on restart is acceptable)
- [ ] **Test**: Rapid messages → throttled
- [ ] **Test**: Messages delivered after throttle period

---

## Phase 7: Conversation & Memory

### Step 7.1 — Conversation Service

- [ ] Create `src/services/conversation.ts`
- [ ] Implement `getOrCreateConversation(phone, companyId)`
- [ ] Implement `getHistory(phone, companyId)` — query messages, ordered by timestamp, limited
- [ ] Implement `addMessage(conversationId, role, content)`
- [ ] Implement `clearHistory(conversationId)`
- [ ] Implement `trimHistory(conversationId, maxMessages)` — delete oldest beyond limit
- [ ] Configure max history length (default: 20 messages)
- [ ] **Test**: Add message → persists
- [ ] **Test**: Trim at limit → oldest removed
- [ ] **Test**: Clear → empty array

### Step 7.2 — Context Window Management

- [ ] Update `src/services/ai/chat.ts` to include conversation history
- [ ] Format history as `ChatMessage[]` array
- [ ] Handle quoted/reply messages (include original as context)
- [ ] Balance history length vs. RAG context vs. token limits
- [ ] **Verify**: Follow-up questions work without repeating context
- [ ] **Test**: Follow-up question uses history
- [ ] **Test**: History + RAG context stays within token limits

### Step 7.3 — Conversation Timeout & Cleanup

- [ ] Track `updatedAt` timestamp on every message
- [ ] On next message, check if conversation has timed out (default: 30 min)
- [ ] If timed out, start fresh conversation context
- [ ] Periodic cleanup of very old conversations (>7 days) from database
- [ ] **Test**: Message within timeout → history preserved
- [ ] **Test**: Message after timeout → fresh start

### Step 7.4 — Welcome Message & Proactive Offers

- [ ] Detect first-time customer (no existing conversation)
- [ ] Add idempotency guard: "find or create" inside a single Convex mutation to prevent duplicate welcomes
- [ ] Send welcome message template (bilingual)
- [ ] Query active offers for the company from `offers` table
- [ ] If offers exist, use AI to generate a natural promotional message
- [ ] Send offer message after welcome, then answer the actual query
- [ ] **Test**: First-time customer → welcome sent
- [ ] **Test**: Returning customer → no welcome
- [ ] **Test**: Active offers → AI-generated offer message
- [ ] **Test**: No offers → skipped gracefully

---

## Phase 8: Owner Commands

### Step 8.1 — Command Parser

- [ ] Create `src/controllers/command.ts`
- [ ] Detect `!` prefix in message
- [ ] Parse command name and arguments
- [ ] Validate sender is the company owner
- [ ] Route to matching command handler
- [ ] Return "unknown command" for invalid commands
- [ ] **Test**: Parse various command formats
- [ ] **Test**: Owner validation
- [ ] **Test**: Unknown command handling

### Step 8.2 — Help Command

- [ ] Create `src/commands/help.ts`
- [ ] Return formatted list of all available commands with descriptions and usage examples
- [ ] **Verify**: `!help` returns well-formatted command list

### Step 8.3 — Status Command

- [ ] Create `src/commands/status.ts`
- [ ] Show: access mode, AI provider, product count, category count, active offers count, image directory status
- [ ] **Verify**: `!status` returns current configuration summary

### Step 8.4 — Clear Command

- [ ] Create `src/commands/clear.ts`
- [ ] `!clear` — clear caller's own history
- [ ] `!clear all` — clear all conversations for the company
- [ ] `!clear <phone>` — clear specific user's history
- [ ] **Verify**: History cleared, confirmation sent

### Step 8.5 — List Command

- [ ] Create `src/commands/list.ts`
- [ ] Show all categories with product counts
- [ ] Show total products, total images
- [ ] **Verify**: `!list` shows data summary

### Step 8.6 — Set Rate Command

- [ ] Create `src/commands/setrate.ts`
- [ ] Usage: `!setrate SAR YER 425` → upsert rate in `currencyRates` table
- [ ] Confirm with current rate displayed
- [ ] **Verify**: Subsequent product queries use new rate

### Step 8.7 — Analytics Command

- [ ] Create `src/commands/analytics.ts`
- [ ] `!analytics` — today's summary
- [ ] `!analytics week` — this week
- [ ] `!analytics month` — this month
- [ ] Format as WhatsApp-friendly text with emojis
- [ ] **Verify**: Summary matches data in database

---

## Phase 9: Advanced Features

### Step 9.1 — Action Detection System

- [ ] Create `src/services/ai/actions.ts`
- [ ] Define action types: `SEND_CATALOG`, `SEND_IMAGES`, `ASK_CLARIFICATION`, `ESCALATE_HUMAN`
- [ ] Parse AI response for JSON action markers
- [ ] Execute corresponding actions after sending text response
- [ ] **Test**: JSON marker parsed correctly
- [ ] **Test**: Unknown action type → ignored safely

### Step 9.2 — Catalog Request Handling

- [ ] Detect `SEND_CATALOG` action
- [ ] Query all categories and products for the company
- [ ] Format as organized WhatsApp message (emoji tree with prices)
- [ ] Handle large catalogs (split into multiple messages)
- [ ] **Verify**: "Show me the catalog" / "كتالوج" triggers catalog send
- [ ] **Test**: Catalog formatted correctly
- [ ] **Test**: Large catalog split into chunks

### Step 9.3 — Image Request Handling

- [ ] Detect `SEND_IMAGES` action with product ID
- [ ] Look up product images from `imageUrls`
- [ ] Send images with bilingual captions
- [ ] Handle multiple images per product
- [ ] **Test**: Product with images → sent
- [ ] **Test**: Product without images → graceful message

### Step 9.4 — Human Handoff

- [ ] Create `src/services/handoff.ts`
- [ ] Implement triggers: explicit request, order intent, low AI confidence, all providers failed
- [ ] On trigger: set `muted = true` + `mutedAt`, notify owner, send customer "connecting you" message
- [ ] Auto-unmute after 12 hours of silence (check `mutedAt` on incoming messages)
- [ ] Add Convex cron job (every 15 min) to unmute stale conversations
- [ ] **Test**: Mute sets flags correctly
- [ ] **Test**: Messages during mute → no response
- [ ] **Test**: Unmute after timeout

### Step 9.5 — Confidence-Based Fallback

- [ ] Include confidence instruction in system prompt (AI returns 0–100 score)
- [ ] Parse confidence from response
- [ ] If below threshold (default: 40) → trigger human handoff
- [ ] Log all low-confidence responses to `analyticsEvents`
- [ ] **Test**: High confidence → normal flow
- [ ] **Test**: Low confidence → handoff triggered

### Step 9.6 — Analytics Event Tracking

- [ ] Create `src/services/analytics.ts`
- [ ] Track events: `message_received`, `product_searched`, `catalog_requested`, `image_requested`, `handoff_triggered`, `ai_response`, `low_confidence`
- [ ] Implement `getAnalyticsSummary(companyId, period)`
- [ ] Add Convex cron job to purge analytics events older than 90 days
- [ ] **Test**: Track event → stored in DB
- [ ] **Test**: Summary calculation correct

---

## Phase 10: Production Hardening

### Step 10.1 — Input Sanitization

- [ ] Sanitize all WhatsApp message inputs (strip control characters)
- [ ] Validate all API request bodies with Zod schemas
- [ ] Convex handles data validation via schema validators
- [ ] Add prompt injection guardrails in system prompt
- [ ] Escape special characters in WhatsApp responses
- [ ] **Test**: SQL injection attempt → sanitized
- [ ] **Test**: XSS in API body → rejected
- [ ] **Test**: Prompt injection → ignored by AI

### Step 10.2 — Graceful Degradation

- [ ] AI failover chain: DeepSeek → Gemini → Groq → human handoff
- [ ] Convex handles retry/reconnection automatically
- [ ] Baileys reconnection on disconnect
- [ ] Friendly error messages to users (bilingual)
- [ ] Global unhandled exception/rejection handlers
- [ ] **Test**: Simulate Convex errors → handled gracefully
- [ ] **Test**: Simulate all AI down → human handoff triggered

### Step 10.3 — Production Logging

- [ ] Configure log rotation (daily, keep 14 days)
- [ ] Add request/response logging for API calls
- [ ] Log AI provider latency and token usage
- [ ] Ensure all sensitive data redacted
- [ ] Health check endpoint shows comprehensive status (DB, WhatsApp, AI)

---

## Phase 11: Testing

### Step 11.1 — Unit Test Coverage

- [ ] Tests for all AI providers (mocked API calls)
- [ ] Tests for RAG pipeline (embedding, search, context building)
- [ ] Tests for conversation service
- [ ] Tests for access control
- [ ] Tests for rate limiter
- [ ] Tests for command parser
- [ ] Tests for language detection
- [ ] Tests for currency conversion
- [ ] Run `bun test` (Vitest) — all pass

### Step 11.2 — Integration Tests

- [ ] Create test harness for message simulation
- [ ] Test: customer sends product question → receives accurate answer
- [ ] Test: customer requests catalog → receives formatted catalog
- [ ] Test: customer requests images → receives images
- [ ] Test: owner sends `!status` → receives status
- [ ] Test: human handoff trigger → bot mutes
- [ ] Test: API CRUD operations end-to-end

### Step 11.3 — API Endpoint Tests

- [ ] Test all company endpoints
- [ ] Test all product endpoints (including auto-embed)
- [ ] Test all category endpoints (including delete conflict)
- [ ] Test all variant endpoints
- [ ] Test offers and currency rate endpoints
- [ ] Test analytics endpoint
- [ ] Test image upload endpoint
- [ ] Test authentication (valid/invalid/missing API key)

---

## Phase 12: Documentation

### Step 12.1 — Developer Documentation

- [ ] Update `README.md` (overview, prerequisites, setup, scripts, architecture link)
- [ ] Document all environment variables in `.env.example`
- [ ] Link to `docs/system_design.md` and `docs/api_spec.json`

### Step 12.2 — API Documentation

- [ ] Keep `docs/api_spec.json` in sync with implementation
- [ ] Serve Swagger UI at `/api/docs` using `@hono/swagger-ui` or similar
- [ ] Add request/response examples for each endpoint

### Step 12.3 — Troubleshooting Guide

- [ ] Create `docs/troubleshooting.md`
- [ ] Cover: Convex setup issues, Baileys QR issues, AI provider errors, common config mistakes
- [ ] Include log reading guide
