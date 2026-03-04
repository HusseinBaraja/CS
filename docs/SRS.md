# Software Requirements Specification (SRS)

## CSCB — Customer Service Chatbot

> **Version:** 1.0  
> **Date:** 2026-03-05  
> **Based on:** [Implementation Plan](./IMPLEMENTATION_PLAN.md) · [System Design](../system_design.md)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the functional and non-functional requirements for **CSCB (Customer Service Chatbot)** — a multi-tenant, AI-powered WhatsApp customer service platform. It serves as the definitive reference for development, testing, and stakeholder validation.

### 1.2 Scope

CSCB enables multiple businesses to deploy intelligent WhatsApp chatbots through a single application instance. Each tenant (company) has its own product catalog, conversation history, AI configuration, and analytics — all managed through a REST API and WhatsApp owner commands.

### 1.3 Definitions & Abbreviations

| Term          | Definition                                                          |
| ------------- | ------------------------------------------------------------------- |
| **Tenant**    | A company using the platform (identified by `companyId`)            |
| **Owner**     | The business owner who administers a tenant via WhatsApp            |
| **Customer**  | An end-user interacting with the chatbot via WhatsApp               |
| **RAG**       | Retrieval-Augmented Generation — AI + vector search pipeline        |
| **Handoff**   | Transferring a conversation from bot to a human operator            |
| **Mute**      | Silencing the bot for a specific conversation during handoff        |
| **Embedding** | A vector representation of text used for semantic search            |
| **Action**    | A structured command embedded in an AI response (e.g. send catalog) |

### 1.4 Technology Stack

| Layer              | Technology                      |
| ------------------ | ------------------------------- |
| Runtime            | Bun                             |
| Language           | TypeScript (strict mode)        |
| WhatsApp Client    | Baileys (multi-device)          |
| AI (Primary)       | DeepSeek V3                     |
| AI (Backup 1)      | Google Gemini Flash             |
| AI (Backup 2)      | Groq (Llama 3.1 8B)             |
| Embeddings         | Gemini (`gemini-embedding-001`) |
| Backend / Database | Convex                          |
| Web Framework      | Hono                            |
| Image Storage      | Cloudflare R2 (S3-compatible)   |
| Process Manager    | PM2                             |
| Logging            | Pino                            |
| Config Validation  | t3-env + Zod                    |
| Testing            | Vitest                          |
| Task Runner        | Turborepo                       |

---

## 2. Overall Description

### 2.1 System Context

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌──────────────┐
│  WhatsApp    │◄───►│         CSCB Application         │◄───►│ Convex Cloud │
│  (Customers  │     │  (Bun + TypeScript + PM2)        │     │ (DB, Vectors,│
│   & Owners)  │     │                                  │     │  Storage)    │
└─────────────┘     │  ┌──────┐  ┌─────┐  ┌─────────┐  │     └──────────────┘
                    │  │Hono  │  │ AI  │  │ RAG     │  │
┌─────────────┐     │  │API   │  │Mgr  │  │Pipeline │  │     ┌──────────────┐
│  REST API   │◄───►│  └──────┘  └─────┘  └─────────┘  │◄───►│ AI Providers │
│  Consumers  │     └──────────────────────────────────┘     │ (DeepSeek,   │
└─────────────┘                                              │  Gemini,Groq)│
                                                             └──────────────┘
```

### 2.2 Users & Roles

| Role         | Channel  | Capabilities                                                      |
| ------------ | -------- | ----------------------------------------------------------------- |
| **Customer** | WhatsApp | Ask product questions, request catalogs/images, escalate to human |
| **Owner**    | WhatsApp | All customer capabilities + `!` admin commands                    |
| **API User** | REST API | Full CRUD on all resources (companies, products, etc.)            |

### 2.3 Operating Environment

- **Host OS:** Windows (local machine)
- **Process Management:** PM2 (auto-restart on crash)
- **Database:** Convex Cloud (fully managed — DB, file storage, vector search)
- **WhatsApp:** Baileys WebSocket connection to WhatsApp Web
- **API Server:** Hono on `localhost:3000`

### 2.4 Design Constraints

- Single application instance manages all tenants
- All data is tenant-scoped by `companyId`
- WhatsApp sessions persist locally in `auth_sessions/{companyId}/`
- Baileys is an unofficial API — intended as temporary until official WhatsApp Business API adoption
- Modular architecture: small, self-contained modules with clear boundaries

---

## 3. Functional Requirements

### 3.1 Configuration & Environment

| ID     | Requirement                                                         | Priority |
| ------ | ------------------------------------------------------------------- | -------- |
| FR-1.1 | Validate all environment variables on startup using Zod schemas     | Must     |
| FR-1.2 | Throw descriptive `ConfigError` on missing or invalid env vars      | Must     |
| FR-1.3 | Apply default values for optional settings (port, log level, etc.)  | Must     |
| FR-1.4 | Provide `.env.example` template for all required/optional variables | Must     |

**Required environment variables:**

- `CONVEX_URL`, `AI_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `GEMINI_API_KEY`, `GROQ_API_KEY`
- `EMBEDDING_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `API_PORT` (default: 3000), `API_KEY`, `NODE_ENV`, `LOG_LEVEL`

---

### 3.2 Logging

| ID     | Requirement                                                         | Priority |
| ------ | ------------------------------------------------------------------- | -------- |
| FR-2.1 | Use Pino for structured JSON logging                                | Must     |
| FR-2.2 | Log level set by environment (`dev` = debug, `prod` = info)         | Must     |
| FR-2.3 | Pretty-print logs in development                                    | Should   |
| FR-2.4 | Write logs to file in production with daily rotation (14-day keep)  | Must     |
| FR-2.5 | Redact sensitive data (phone numbers, API keys) from all log output | Must     |

---

### 3.3 Error Handling

| ID     | Requirement                                                                                                             | Priority |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-3.1 | Define custom error classes: `ConfigError`, `DatabaseError`, `AIError`, `WhatsAppError`, `AuthError`, `ValidationError` | Must     |
| FR-3.2 | All errors include structured metadata (code, message, cause)                                                           | Must     |
| FR-3.3 | Errors log with full context via Pino                                                                                   | Must     |
| FR-3.4 | Proper error hierarchy (instanceof checks work correctly)                                                               | Must     |

---

### 3.4 Database (Convex)

| ID     | Requirement                                                                                                                                                                     | Priority |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-4.1 | Define schema for all tables: `companies`, `categories`, `products`, `productVariants`, `embeddings`, `conversations`, `messages`, `offers`, `currencyRates`, `analyticsEvents` | Must     |
| FR-4.2 | All tables scoped by `companyId` for tenant isolation                                                                                                                           | Must     |
| FR-4.3 | Vector index on `embeddings` table (768 dimensions, filter by `companyId` & `language`)                                                                                         | Must     |
| FR-4.4 | Provide a seed script with realistic bilingual sample data                                                                                                                      | Must     |
| FR-4.5 | Seed script runs idempotently (clears then re-seeds)                                                                                                                            | Should   |
| FR-4.6 | Support data export/backup via Convex snapshot export                                                                                                                           | Should   |

**Database tables:**

| Table             | Key Fields                                                                                    | Indexes                                            |
| ----------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `companies`       | name, ownerPhone, config, timezone                                                            | `by_owner_phone`                                   |
| `categories`      | companyId, nameEn, nameAr, descriptionEn, descriptionAr                                       | `by_company`                                       |
| `products`        | companyId, categoryId, nameEn/Ar, descriptionEn/Ar, specs, basePrice, baseCurrency, imageUrls | `by_company`, `by_category`                        |
| `productVariants` | productId, variantLabel, attributes, priceOverride                                            | `by_product`                                       |
| `embeddings`      | companyId, productId, embedding[], textContent, language                                      | `by_company`, `by_product`, vector: `by_embedding` |
| `conversations`   | companyId, phoneNumber, muted, mutedAt                                                        | `by_company_phone`                                 |
| `messages`        | conversationId, role, content, timestamp                                                      | `by_conversation`, `by_conversation_time`          |
| `offers`          | companyId, contentEn/Ar, active, startDate, endDate                                           | `by_company_active`                                |
| `currencyRates`   | companyId, fromCurrency, toCurrency, rate                                                     | `by_company`, `by_company_pair`                    |
| `analyticsEvents` | companyId, eventType, payload                                                                 | `by_company_type`                                  |

---

### 3.5 REST API

#### 3.5.1 General

| ID     | Requirement                                            | Priority |
| ------ | ------------------------------------------------------ | -------- |
| FR-5.1 | Hono server starts on configurable port (default 3000) | Must     |
| FR-5.2 | API key authentication via `Authorization` header      | Must     |
| FR-5.3 | Requests without valid API key rejected with 401/403   | Must     |
| FR-5.4 | CORS configured with restrictive origin policy         | Must     |
| FR-5.5 | Request rate limiting via middleware                   | Must     |
| FR-5.6 | `GET /api/health` returns system status                | Must     |
| FR-5.7 | All request bodies validated with Zod schemas          | Must     |

#### 3.5.2 Company Endpoints

| ID      | Endpoint                    | Description                                 |
| ------- | --------------------------- | ------------------------------------------- |
| FR-5.10 | `GET /api/companies`        | List all companies                          |
| FR-5.11 | `GET /api/companies/:id`    | Get single company                          |
| FR-5.12 | `POST /api/companies`       | Register new company                        |
| FR-5.13 | `PUT /api/companies/:id`    | Update company config                       |
| FR-5.14 | `DELETE /api/companies/:id` | Delete company (cascades to all child data) |

#### 3.5.3 Category Endpoints

| ID      | Endpoint                                    | Description                                |
| ------- | ------------------------------------------- | ------------------------------------------ |
| FR-5.20 | `GET /api/companies/:cid/categories`        | List categories for company                |
| FR-5.21 | `GET /api/companies/:cid/categories/:id`    | Get single category                        |
| FR-5.22 | `POST /api/companies/:cid/categories`       | Create category                            |
| FR-5.23 | `PUT /api/companies/:cid/categories/:id`    | Update category                            |
| FR-5.24 | `DELETE /api/companies/:cid/categories/:id` | Delete (409 if products exist in category) |

#### 3.5.4 Product Endpoints

| ID      | Endpoint                                  | Description                                       |
| ------- | ----------------------------------------- | ------------------------------------------------- |
| FR-5.30 | `GET /api/companies/:cid/products`        | List (filters: `?categoryId`, `?search`)          |
| FR-5.31 | `GET /api/companies/:cid/products/:id`    | Get product with variants included                |
| FR-5.32 | `POST /api/companies/:cid/products`       | Create product (auto-generates embeddings)        |
| FR-5.33 | `PUT /api/companies/:cid/products/:id`    | Update product (re-generates embeddings)          |
| FR-5.34 | `DELETE /api/companies/:cid/products/:id` | Delete (cascades embeddings, variants, R2 images) |

#### 3.5.5 Product Variant Endpoints

| ID      | Endpoint                                          | Description                                         |
| ------- | ------------------------------------------------- | --------------------------------------------------- |
| FR-5.40 | `GET /api/companies/:cid/products/:pid/variants`  | List variants for product                           |
| FR-5.41 | `POST /api/companies/:cid/products/:pid/variants` | Create variant                                      |
| FR-5.42 | `PUT .../variants/:id`                            | Update variant (enforce company ownership via join) |
| FR-5.43 | `DELETE .../variants/:id`                         | Delete variant (enforce company ownership via join) |

#### 3.5.6 Offers & Currency Endpoints

| ID      | Endpoint                                 | Description                                             |
| ------- | ---------------------------------------- | ------------------------------------------------------- |
| FR-5.50 | `GET /api/companies/:cid/offers`         | List offers (default: active only; `?all=true` for all) |
| FR-5.51 | `POST /api/companies/:cid/offers`        | Create offer                                            |
| FR-5.52 | `PUT /api/companies/:cid/offers/:id`     | Update offer                                            |
| FR-5.53 | `DELETE /api/companies/:cid/offers/:id`  | Delete offer                                            |
| FR-5.54 | `GET /api/companies/:cid/currency-rates` | List exchange rates                                     |
| FR-5.55 | `PUT /api/companies/:cid/currency-rates` | Upsert exchange rate                                    |

#### 3.5.7 Analytics Endpoint

| ID      | Endpoint                                                      | Description                  |
| ------- | ------------------------------------------------------------- | ---------------------------- |
| FR-5.60 | `GET /api/companies/:cid/analytics?period=today\|week\|month` | Aggregated analytics summary |

**Analytics response fields:** Total conversations, product searches, image requests, human handoffs, average response time, top searched products.

#### 3.5.8 Image Upload Endpoint

| ID      | Endpoint                                                 | Description                        |
| ------- | -------------------------------------------------------- | ---------------------------------- |
| FR-5.70 | `POST /api/companies/:cid/products/:pid/images`          | Upload image (multipart/form-data) |
| FR-5.71 | `DELETE /api/companies/:cid/products/:pid/images/:index` | Remove single image                |

| ID      | Requirement                                                           | Priority |
| ------- | --------------------------------------------------------------------- | -------- |
| FR-5.72 | Upload stores file in R2 under `{companyId}/{productId}/{uuid}.{ext}` | Must     |
| FR-5.73 | Only JPEG, PNG, WebP accepted; other types rejected (400)             | Must     |
| FR-5.74 | R2 public URL appended to product's `imageUrls` array                 | Must     |
| FR-5.75 | On product deletion, R2 images cleaned up asynchronously              | Must     |

---

### 3.6 AI Provider System

| ID     | Requirement                                                                   | Priority |
| ------ | ----------------------------------------------------------------------------- | -------- |
| FR-6.1 | All providers implement common `AIProvider` interface (`chat`, `isAvailable`) | Must     |
| FR-6.2 | DeepSeek provider: OpenAI-compatible API, timeout + retry logic               | Must     |
| FR-6.3 | Gemini provider: Gemini Flash model, same interface                           | Must     |
| FR-6.4 | Groq provider: Llama 3.1 8B model, same interface                             | Must     |
| FR-6.5 | Provider Manager: automatic failover chain (DeepSeek → Gemini → Groq → error) | Must     |
| FR-6.6 | Every failover event logged                                                   | Must     |
| FR-6.7 | All-fail throws `AIError`                                                     | Must     |
| FR-6.8 | Retry on transient failures (429, 500, 503)                                   | Must     |

---

### 3.7 RAG Pipeline

| ID      | Requirement                                                               | Priority |
| ------- | ------------------------------------------------------------------------- | -------- |
| FR-7.1  | Generate 768-dimension embeddings using `gemini-embedding-001`            | Must     |
| FR-7.2  | Support batch embedding generation                                        | Must     |
| FR-7.3  | In-memory LRU cache for query embeddings                                  | Should   |
| FR-7.4  | 2 backup embedding providers (no text fallback)                           | Must     |
| FR-7.5  | Each product gets 2 embeddings: Arabic + English                          | Must     |
| FR-7.6  | Embedding regeneration on product create/update (idempotent)              | Must     |
| FR-7.7  | Vector search filtered by `companyId`, ranked by `_score`                 | Must     |
| FR-7.8  | Configurable similarity threshold (default: 0.3)                          | Should   |
| FR-7.9  | Context builder formats product name, description, specs, price, variants | Must     |
| FR-7.10 | Context includes currency-converted prices                                | Must     |
| FR-7.11 | Context size limited to stay within AI token limits                       | Must     |

---

### 3.8 System Prompts & Language

| ID     | Requirement                                                                   | Priority |
| ------ | ----------------------------------------------------------------------------- | -------- |
| FR-8.1 | Business assistant persona with language-matched responses                    | Must     |
| FR-8.2 | Topic boundary rules (only business questions answered)                       | Must     |
| FR-8.3 | Hallucination prevention instructions                                         | Must     |
| FR-8.4 | Action marker format (JSON in response for catalog/images/escalate)           | Must     |
| FR-8.5 | Configurable price negotiation behavior: STRICT / REDIRECT_OWNER / SHOW_RANGE | Should   |
| FR-8.6 | Detect Arabic via Unicode ranges; default to English for mixed content        | Must     |

---

### 3.9 WhatsApp Integration

| ID      | Requirement                                                                     | Priority |
| ------- | ------------------------------------------------------------------------------- | -------- |
| FR-9.1  | Baileys client with multi-device authentication                                 | Must     |
| FR-9.2  | Session persistence to local directory (`auth_sessions/{companyId}/`)           | Must     |
| FR-9.3  | Handle connection events: `open`, `close`, `connecting`                         | Must     |
| FR-9.4  | QR code display in terminal + saved as image + exposed via API                  | Must     |
| FR-9.5  | Multi-session management (one session per company, simultaneous)                | Must     |
| FR-9.6  | On startup, reconnect all previously active sessions                            | Must     |
| FR-9.7  | Ignore: group messages, status updates, own messages, offline-received messages | Must     |
| FR-9.8  | Route `!` prefix messages to command handler                                    | Must     |
| FR-9.9  | Route text messages to AI handler                                               | Must     |
| FR-9.10 | Politely decline media messages (voice notes, etc.)                             | Must     |
| FR-9.11 | Show typing indicator (`composing` presence) before responding                  | Should   |
| FR-9.12 | Simulate natural delay (1–3 seconds) before sending                             | Should   |
| FR-9.13 | Message queuing to prevent WhatsApp rate limiting                               | Must     |
| FR-9.14 | Send text and image messages with captions                                      | Must     |

---

### 3.10 Access Control

| ID      | Requirement                                                            | Priority |
| ------- | ---------------------------------------------------------------------- | -------- |
| FR-10.1 | Access modes per company: `OWNER_ONLY`, `SINGLE_NUMBER`, `LIST`, `ALL` | Must     |
| FR-10.2 | Authorization checked before processing any message                    | Must     |
| FR-10.3 | Owner phone always has access regardless of mode                       | Must     |
| FR-10.4 | Owner identified for admin command authorization                       | Must     |

---

### 3.11 Rate Limiting

| ID      | Requirement                                                         | Priority |
| ------- | ------------------------------------------------------------------- | -------- |
| FR-11.1 | Per-phone-number rate limiting                                      | Must     |
| FR-11.2 | Configurable minimum interval between messages (default: 3 seconds) | Must     |
| FR-11.3 | Messages exceeding limit are queued, not dropped                    | Must     |
| FR-11.4 | In-memory tracking (reset on restart is acceptable)                 | Must     |

---

### 3.12 Conversation & Memory

| ID      | Requirement                                                                      | Priority |
| ------- | -------------------------------------------------------------------------------- | -------- |
| FR-12.1 | Per-user, per-company conversation history (stored in `messages` table)          | Must     |
| FR-12.2 | `getHistory`, `addMessage`, `clearHistory`, `trimHistory` operations             | Must     |
| FR-12.3 | Configurable max history length (default: 20 messages)                           | Must     |
| FR-12.4 | Conversation history included in AI context                                      | Must     |
| FR-12.5 | Follow-up questions work without repeating full context                          | Must     |
| FR-12.6 | Quoted/reply messages include original message as context                        | Should   |
| FR-12.7 | Conversation timeout: configurable idle period (default: 30 min) → fresh context | Must     |
| FR-12.8 | Periodic cleanup of conversations older than 7 days                              | Should   |

---

### 3.13 Welcome Message & Proactive Offers

| ID      | Requirement                                                                                     | Priority |
| ------- | ----------------------------------------------------------------------------------------------- | -------- |
| FR-13.1 | Detect first-time customer (no existing conversation)                                           | Must     |
| FR-13.2 | Idempotency guard: find-or-create inside a single Convex mutation to prevent duplicate welcomes | Must     |
| FR-13.3 | Send bilingual welcome message template                                                         | Must     |
| FR-13.4 | If active offers exist, use AI to generate a natural promotional message                        | Must     |
| FR-13.5 | Returning customers skip welcome; go directly to answering their query                          | Must     |

---

### 3.14 Owner Commands (`!` prefix)

| ID      | Command                 | Description                                                   |
| ------- | ----------------------- | ------------------------------------------------------------- |
| FR-14.1 | `!help`                 | List all available commands with descriptions and usage       |
| FR-14.2 | `!status`               | Show: access mode, AI provider, product/category/offer counts |
| FR-14.3 | `!clear`                | Clear own history                                             |
| FR-14.4 | `!clear all`            | Clear all conversations for the company                       |
| FR-14.5 | `!clear <phone>`        | Clear specific user's history                                 |
| FR-14.6 | `!list`                 | Show all categories with product counts and totals            |
| FR-14.7 | `!setrate FROM TO RATE` | Upsert currency exchange rate (e.g. `!setrate SAR YER 425`)   |
| FR-14.8 | `!analytics [period]`   | Show analytics summary (default: today; week, month)          |

| ID       | Requirement                                   | Priority |
| -------- | --------------------------------------------- | -------- |
| FR-14.9  | Only company owner can execute commands       | Must     |
| FR-14.10 | Unknown commands return helpful error message | Must     |

---

### 3.15 Action Detection System

| ID      | Requirement                                                                                           | Priority |
| ------- | ----------------------------------------------------------------------------------------------------- | -------- |
| FR-15.1 | Detect actions from AI response: `SEND_CATALOG`, `SEND_IMAGES`, `ASK_CLARIFICATION`, `ESCALATE_HUMAN` | Must     |
| FR-15.2 | Parse JSON action markers from AI response text                                                       | Must     |
| FR-15.3 | Execute actions after sending text response                                                           | Must     |
| FR-15.4 | Unknown action types ignored safely                                                                   | Must     |

---

### 3.16 Catalog Requests

| ID      | Requirement                                                             | Priority |
| ------- | ----------------------------------------------------------------------- | -------- |
| FR-16.1 | On `SEND_CATALOG` action, query all categories and products for company | Must     |
| FR-16.2 | Format as organized WhatsApp message grouped by category                | Must     |
| FR-16.3 | Works in both Arabic and English                                        | Must     |
| FR-16.4 | Large catalogs split into multiple messages                             | Must     |

---

### 3.17 Image Requests

| ID      | Requirement                                       | Priority |
| ------- | ------------------------------------------------- | -------- |
| FR-17.1 | On `SEND_IMAGES` action, look up product images   | Must     |
| FR-17.2 | Send images with bilingual captions               | Must     |
| FR-17.3 | Handle multiple images per product                | Must     |
| FR-17.4 | Products without images return a graceful message | Must     |

---

### 3.18 Human Handoff

| ID      | Requirement                                                                                | Priority |
| ------- | ------------------------------------------------------------------------------------------ | -------- |
| FR-18.1 | Trigger on: explicit request, order intent, low AI confidence, all-AI-fail                 | Must     |
| FR-18.2 | On trigger: set `muted=true`, `mutedAt=now()` in conversation                              | Must     |
| FR-18.3 | Notify owner with customer info and conversation context                                   | Must     |
| FR-18.4 | Send customer: "Connecting you with our team…"                                             | Must     |
| FR-18.5 | Bot stays silent for muted conversations                                                   | Must     |
| FR-18.6 | Auto-unmute after 12 hours of silence (checked on next message + Convex cron every 15 min) | Must     |

---

### 3.19 Confidence-Based Fallback

| ID      | Requirement                                                         | Priority |
| ------- | ------------------------------------------------------------------- | -------- |
| FR-19.1 | AI returns confidence score (0–100) via system prompt instruction   | Must     |
| FR-19.2 | Below threshold (configurable, default: 40) → trigger human handoff | Must     |
| FR-19.3 | Log all low-confidence responses to `analyticsEvents`               | Must     |

---

### 3.20 Analytics & Event Tracking

| ID      | Requirement                                                                                                                                        | Priority |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-20.1 | Track events: `message_received`, `product_searched`, `catalog_requested`, `image_requested`, `handoff_triggered`, `ai_response`, `low_confidence` | Must     |
| FR-20.2 | Summary aggregation by period (today / week / month)                                                                                               | Must     |
| FR-20.3 | Convex cron job to purge events older than 90 days                                                                                                 | Should   |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID      | Requirement                                                         | Priority |
| ------- | ------------------------------------------------------------------- | -------- |
| NFR-1.1 | AI response latency tracked and logged                              | Must     |
| NFR-1.2 | LRU cache for repeated query embeddings (avoid redundant API calls) | Should   |
| NFR-1.3 | Message queuing prevents WhatsApp rate-limit violations             | Must     |

### 4.2 Reliability

| ID      | Requirement                                                          | Priority |
| ------- | -------------------------------------------------------------------- | -------- |
| NFR-2.1 | PM2 auto-restarts application on crash                               | Must     |
| NFR-2.2 | PM2 restarts on max memory threshold breach                          | Must     |
| NFR-2.3 | AI failover chain ensures responses even under provider outages      | Must     |
| NFR-2.4 | Baileys auto-reconnects on WhatsApp disconnect                       | Must     |
| NFR-2.5 | Global unhandled exception/rejection handlers prevent silent crashes | Must     |
| NFR-2.6 | Users always receive a response, even if a fallback error message    | Must     |
| NFR-2.7 | Convex handles retry/reconnection automatically                      | Must     |

### 4.3 Security

| ID      | Requirement                                                   | Priority |
| ------- | ------------------------------------------------------------- | -------- |
| NFR-3.1 | API key authentication on all REST endpoints                  | Must     |
| NFR-3.2 | All WhatsApp inputs sanitized (strip control characters)      | Must     |
| NFR-3.3 | Convex schema validators prevent invalid data insertion       | Must     |
| NFR-3.4 | Per-phone + per-IP rate limiting                              | Must     |
| NFR-3.5 | Prompt injection guardrails in system prompt                  | Must     |
| NFR-3.6 | Phone numbers: hashed storage option for GDPR-like compliance | Should   |
| NFR-3.7 | `.env` never committed to version control                     | Must     |
| NFR-3.8 | Restrictive CORS origin policy                                | Must     |
| NFR-3.9 | Sensitive data redacted from all logs                         | Must     |

### 4.4 Maintainability

| ID      | Requirement                                               | Priority |
| ------- | --------------------------------------------------------- | -------- |
| NFR-4.1 | Modular architecture: small, self-contained modules       | Must     |
| NFR-4.2 | TypeScript strict mode throughout                         | Must     |
| NFR-4.3 | Oxlint for type-aware linting                             | Must     |
| NFR-4.4 | Prettier for consistent formatting                        | Must     |
| NFR-4.5 | Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`) | Should   |
| NFR-4.6 | GitHub Flow branching strategy                            | Should   |

### 4.5 Testability

| ID      | Requirement                                                                                                                           | Priority |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| NFR-5.1 | Unit tests for all core services (providers, RAG, conversation, access control, rate limiter, commands, language detection, currency) | Must     |
| NFR-5.2 | Integration tests for end-to-end message flows                                                                                        | Must     |
| NFR-5.3 | API endpoint tests for all REST routes                                                                                                | Must     |
| NFR-5.4 | TDD followed throughout — tests written alongside each phase                                                                          | Should   |

### 4.6 Internationalization

| ID      | Requirement                                         | Priority |
| ------- | --------------------------------------------------- | -------- |
| NFR-6.1 | Full Arabic and English bilingual support           | Must     |
| NFR-6.2 | Language auto-detected per message                  | Must     |
| NFR-6.3 | All product data stored in both languages           | Must     |
| NFR-6.4 | Bot responds in the customer's detected language    | Must     |
| NFR-6.5 | Error/fallback messages available in both languages | Must     |

---

## 5. Data Requirements

### 5.1 Product Variants

Variants use a flexible `attributes` object for any level of complexity:

- **Simple:** `{ "size": "Large" }`
- **Medium:** `{ "size": "Large", "color": "White" }`
- **Complex:** `{ "size": "Large", "color": "White", "material": "Foam", "pack_qty": 500 }`

If a variant has `priceOverride`, it replaces the product's `basePrice`. If `null`, the product's base price is used.

### 5.2 Currency

- Prices stored in `baseCurrency` (e.g. SAR)
- Converted to customer's preferred/default currency on display
- Exchange rates stored per company in `currencyRates` table
- Owner sets rates via `!setrate` command or REST API

### 5.3 Analytics Events

| Event Type          | Tracked Data                         |
| ------------------- | ------------------------------------ |
| `message_received`  | Phone, language, timestamp           |
| `product_searched`  | Query text, results count, top match |
| `catalog_requested` | Phone, timestamp                     |
| `image_requested`   | Product ID, timestamp                |
| `handoff_triggered` | Phone, reason, timestamp             |
| `ai_response`       | Provider used, latency, token count  |
| `low_confidence`    | Query, confidence score, response    |

---

## 6. Interface Requirements

### 6.1 WhatsApp Interface

- Incoming: text messages processed, media messages declined politely
- Outgoing: text messages, images with captions, formatted catalogs
- Owner commands: `!` prefixed messages for admin operations

### 6.2 REST API Interface

- Base URL: `http://localhost:3000/api`
- Authentication: API key in `Authorization` header
- Content-Type: `application/json` (except image upload: `multipart/form-data`)
- API documentation served at `/api/docs` via Swagger UI

### 6.3 QR Code Interface

- Terminal: ANSI art display for initial WhatsApp pairing
- File: saved to `data/qr/{companyId}.png`
- API: `GET /api/companies/:companyId/qr` returns QR image

---

## 7. Documentation Requirements

| ID    | Requirement                                                       | Priority |
| ----- | ----------------------------------------------------------------- | -------- |
| DOC-1 | README with: overview, prerequisites, setup instructions, scripts | Must     |
| DOC-2 | `.env.example` documenting all environment variables              | Must     |
| DOC-3 | System design document (`system_design.md`)                       | Must     |
| DOC-4 | Interactive API docs at `/api/docs` (Swagger UI)                  | Should   |
| DOC-5 | Troubleshooting guide (`troubleshooting.md`)                      | Should   |

---

## 8. Appendix

### A. Project Directory Structure

```
src/
├── config/              # Configuration & environment
├── providers/           # Pluggable AI provider system
├── services/            # Core business logic
│   ├── whatsapp/        # WhatsApp integration
│   ├── ai/              # AI orchestration
│   └── rag/             # RAG pipeline
├── controllers/         # Request handlers
├── commands/            # Individual owner commands
├── api/                 # REST API layer
│   ├── middleware/
│   └── routes/
├── utils/               # Shared utilities
└── index.ts             # Application entry point

convex/                  # Convex backend
├── schema.ts
├── seed.ts
└── helpers.ts
```

### B. Traceability Matrix

| Phase | Requirements Covered     |
| ----- | ------------------------ |
| 1     | FR-1.x, FR-2.x, FR-3.x   |
| 2     | FR-4.x                   |
| 3     | FR-5.x                   |
| 4     | FR-6.x, FR-8.x           |
| 5     | FR-7.x                   |
| 6     | FR-9.x, FR-10.x, FR-11.x |
| 7     | FR-12.x, FR-13.x         |
| 8     | FR-14.x                  |
| 9     | FR-15.x – FR-20.x        |
| 10    | NFR-2.x, NFR-3.x         |
| 11    | NFR-5.x                  |
| 12    | DOC-x                    |
