# Project Charter & Vision and Scope Document

## CSCB — Customer Service Chatbot

> **Version:** 1.0  
> **Date:** 2026-03-05  
> **Status:** Active

---

# Part I — Project Charter

## 1. Project Overview

**CSCB (Customer Service Chatbot)** is a multi-tenant, AI-powered WhatsApp customer service platform. It enables businesses — starting with packaging/disposables suppliers in the Middle East — to deploy intelligent chatbots that handle product inquiries, catalog browsing, image sharing, and human handoff, all through WhatsApp.

A single application instance serves multiple companies. Each tenant has its own product catalog, conversation history, AI configuration, analytics, and WhatsApp session.

## 2. Business Case

### Problem Statement

Small and mid-size businesses in regions like Yemen and Saudi Arabia rely heavily on WhatsApp for customer communication. Owners manually answer repetitive product questions around the clock — draining time, creating inconsistent responses, and losing potential sales outside business hours.

### Proposed Solution

An AI-powered WhatsApp bot that:

- Answers product questions instantly, 24/7, in Arabic and English
- Searches a real product catalog using semantic (RAG) search — no hallucinated answers
- Sends product images and formatted catalogs on demand
- Escalates to the human owner when the bot can't help or the customer asks
- Gives owners analytics on customer activity and product interest
- Supports multiple businesses from a single deployment

### Value Proposition

| Benefit                     | Impact                                                   |
| --------------------------- | -------------------------------------------------------- |
| **24/7 availability**       | No missed inquiries outside business hours               |
| **Instant responses**       | Customers get answers in seconds, not hours              |
| **Consistent accuracy**     | Responses grounded in real catalog data (RAG)            |
| **Bilingual support**       | Arabic and English — matching the market                 |
| **Owner time saved**        | Automates 70–90% of repetitive inquiries                 |
| **Multi-tenant efficiency** | One deployment serves multiple businesses                |
| **Low operating cost**      | Uses cheapest viable AI providers ($0.05–$0.14/M tokens) |

## 3. Objectives & Success Criteria

| Objective                          | Success Metric                                        |
| ---------------------------------- | ----------------------------------------------------- |
| Automate routine product inquiries | ≥ 80% of messages handled without human handoff       |
| Maintain response accuracy         | ≤ 5% customer complaints about incorrect info         |
| Ensure high availability           | ≥ 99% uptime (auto-restart via PM2)                   |
| Provide bilingual experience       | Arabic and English detection and response             |
| Enable multi-tenant operation      | ≥ 2 companies running simultaneously on day one       |
| Keep costs low                     | AI API costs < $10/month per active tenant            |
| Deliver actionable analytics       | Daily/weekly reports delivered to owners via WhatsApp |

## 4. Scope

### In Scope

- WhatsApp chatbot (via Baileys) with multi-company session management
- AI-powered responses with failover (DeepSeek → Gemini → Groq)
- RAG pipeline: product embeddings, vector search, context-aware answers
- Full product catalog management (categories, products, variants, images)
- REST API for all CRUD operations
- Human handoff system with auto-unmute
- Owner commands (`!help`, `!status`, `!clear`, `!list`, `!setrate`, `!analytics`)
- Bilingual support (Arabic + English)
- Analytics event tracking and reporting
- Currency conversion with configurable exchange rates
- Welcome messages and proactive offer delivery
- Image upload/storage via Cloudflare R2
- PM2 process management on Windows
- Data seeding and backup/export

### Out of Scope

- Web dashboard / admin UI (API-only management for now)
- Official WhatsApp Business API integration (planned future migration from Baileys)
- Payment processing or order management
- Multi-language support beyond Arabic and English
- Cloud deployment (runs locally on Windows via PM2)
- Mobile app
- Customer authentication (phone number is the identity)
- Automated marketing campaigns / bulk messaging

## 5. Stakeholders

| Role                | Responsibility                                                        |
| ------------------- | --------------------------------------------------------------------- |
| **Project Owner**   | Requirements, priorities, final acceptance                            |
| **Developer(s)**    | Design, implementation, testing, deployment                           |
| **Business Owners** | End users — manage their companies via WhatsApp commands and REST API |
| **Customers**       | End users — interact with the chatbot via WhatsApp                    |

## 6. Technology Decisions

| Decision                         | Rationale                                                      |
| -------------------------------- | -------------------------------------------------------------- |
| **Bun** runtime                  | Fast JS/TS runtime with built-in bundler                       |
| **TypeScript strict mode**       | Type safety as a core priority                                 |
| **Baileys** for WhatsApp         | Lightweight, actively maintained; temporary until official API |
| **Convex** for backend           | Serverless DB with built-in vector search, file storage, crons |
| **Hono** for REST API            | Built for Bun, extremely fast, Express-like DX                 |
| **DeepSeek V3** as primary AI    | $0.14/M input tokens — best cost/quality ratio                 |
| **Gemini Flash** as backup       | Fast, cheap, good quality fallback                             |
| **Groq (Llama 3.1)** as tertiary | $0.05/M tokens — fastest inference for last-resort             |
| **Gemini Embeddings**            | Multi-language support (Arabic + English), affordable          |
| **Cloudflare R2**                | S3-compatible object storage, generous free tier               |
| **PM2** on Windows               | Keeps bot alive with auto-restart                              |
| **Modular architecture**         | Small modules to avoid large monolithic files                  |

## 7. Risks & Mitigations

| Risk                                            | Likelihood | Impact | Mitigation                                                |
| ----------------------------------------------- | ---------- | ------ | --------------------------------------------------------- |
| Baileys breaks due to WhatsApp protocol changes | Medium     | High   | Monitor upstream; plan migration to official Business API |
| AI provider outage                              | Medium     | Medium | 3-provider failover chain + human handoff as last resort  |
| WhatsApp account ban (unofficial API)           | Low        | High   | Rate limiting, natural delays, comply with WhatsApp ToS   |
| Prompt injection attacks                        | Medium     | Medium | System prompt guardrails, input sanitization              |
| Convex free tier limits hit                     | Low        | Medium | Monitor usage; upgrade plan or optimize queries           |
| Embedding quality for Arabic text               | Low        | Medium | Gemini embeddings have strong multilingual support        |
| Data loss                                       | Low        | High   | Convex snapshot exports, automated backup scripts         |

## 8. Constraints

- **Platform:** Windows local machine (no cloud deployment initially)
- **Budget:** Minimal — leverage free tiers and cheapest AI providers
- **Team Size:** Small team (2–3 developers)
- **WhatsApp API:** Unofficial (Baileys) — must comply with rate limits and usage patterns
- **Architecture:** Modular, small files — optimized for AI-assisted development

## 9. Milestones

| Phase | Milestone                                       | Dependencies   |
| ----- | ----------------------------------------------- | -------------- |
| 1     | Project foundation (config, logging, errors)    | None           |
| 2     | Convex backend (schema, seed, backup)           | Phase 1        |
| 3     | REST API (all CRUD endpoints)                   | Phase 2        |
| 4     | AI provider system with failover                | Phase 1        |
| 5     | RAG pipeline (embeddings, search, context)      | Phases 2, 4    |
| 6     | WhatsApp integration (Baileys, sessions, QR)    | Phases 2, 4, 5 |
| 7     | Conversation memory & welcome messages          | Phase 6        |
| 8     | Owner commands                                  | Phases 6, 7    |
| 9     | Advanced features (actions, handoff, analytics) | Phases 5–8     |
| 10    | Production hardening                            | All previous   |
| 11    | Full test coverage                              | All previous   |
| 12    | Documentation                                   | All previous   |

---

# Part II — Vision and Scope

## 1. Vision Statement

> **CSCB empowers small businesses to provide instant, accurate, 24/7 customer service through WhatsApp — without hiring additional staff, without building custom software, and at a cost of pennies per conversation.**

The vision is that any business owner can plug in their product catalog and have a professional, bilingual AI assistant answering customer questions on WhatsApp within minutes — grounded in real data, never hallucinating, and smart enough to hand off to a human when it can't help.

## 2. Product Position Statement

| Element         | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| **For**         | Small and mid-size businesses in the Middle East (initially packaging/disposables)            |
| **Who**         | Need to handle high volumes of WhatsApp customer inquiries                                    |
| **CSCB is**     | A multi-tenant AI-powered WhatsApp customer service platform                                  |
| **That**        | Automates product inquiries, catalog browsing, and image sharing                              |
| **Unlike**      | Generic chatbot builders (Chatfuel, ManyChat) or manual WhatsApp support                      |
| **Our product** | Is grounded in real catalog data (RAG), fully bilingual, and costs a fraction of alternatives |

## 3. Feature Scope

Features are organized by priority using the MoSCoW method:

### Must Have (v1.0)

| Feature                        | Description                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| **Multi-tenant architecture**  | Single instance serves multiple companies, fully isolated       |
| **AI-powered responses**       | Natural language answers grounded in product catalog (RAG)      |
| **Bilingual support**          | Auto-detect Arabic/English, respond in matching language        |
| **Product catalog management** | Categories, products, variants — full CRUD via REST API         |
| **Semantic product search**    | Vector search using Gemini embeddings on Convex                 |
| **AI provider failover**       | DeepSeek → Gemini → Groq → human handoff                        |
| **WhatsApp integration**       | Baileys multi-device, multi-session, QR pairing                 |
| **Human handoff**              | Mute bot, notify owner, auto-unmute after 12h                   |
| **Owner commands**             | `!help`, `!status`, `!clear`, `!list`, `!setrate`, `!analytics` |
| **Access control**             | OWNER_ONLY, SINGLE_NUMBER, LIST, ALL modes                      |
| **Rate limiting**              | Per-phone throttling for WhatsApp messages and API requests     |
| **Image management**           | Upload to Cloudflare R2, send via WhatsApp                      |
| **Currency conversion**        | Configurable exchange rates per company                         |
| **REST API**                   | Full CRUD API with authentication, validation, rate limiting    |
| **Process management**         | PM2 auto-restart on crashes                                     |
| **Structured logging**         | Pino with redaction, rotation, level control                    |
| **Type-safe configuration**    | t3-env + Zod validation on startup                              |

### Should Have (v1.0 stretch goals)

| Feature                       | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| **Welcome messages & offers** | Greet first-time customers, share active promotions |
| **Analytics reporting**       | Event tracking, summary via WhatsApp and API        |
| **Confidence-based fallback** | Low-confidence responses trigger human handoff      |
| **Conversation timeout**      | Auto-reset context after 30 min idle                |
| **Catalog formatting**        | Organized, category-grouped WhatsApp messages       |
| **Typing indicators**         | Show "composing" before responding                  |
| **Natural response delay**    | 1–3 second delay to feel human-like                 |
| **Swagger API docs**          | Interactive docs at `/api/docs`                     |

### Could Have (post-v1.0)

| Feature                            | Description                                          |
| ---------------------------------- | ---------------------------------------------------- |
| **Web admin dashboard**            | Visual UI for managing products, viewing analytics   |
| **Official WhatsApp Business API** | Migration from Baileys to official, supported API    |
| **Order management**               | Track orders placed via chat                         |
| **Customer CRM features**          | Customer profiles, purchase history                  |
| **Automated analytics reports**    | Scheduled daily/weekly reports to owner via WhatsApp |
| **Cloud deployment**               | Move from local Windows to cloud infrastructure      |

### Won't Have (explicitly excluded)

| Feature                     | Reason                                          |
| --------------------------- | ----------------------------------------------- |
| Payment processing          | Out of scope — handled externally               |
| Group chat support          | Complexity; focus on 1:1 customer service       |
| Voice/video call handling   | WhatsApp text-only scope                        |
| Multi-language beyond AR/EN | Market doesn't require it yet                   |
| Mobile application          | WhatsApp is the interface                       |
| Bulk marketing messages     | Anti-spam compliance; not the product's purpose |

## 4. User Scenarios

### Scenario 1: Customer Asks About a Product

> **Maryam** messages the bot: "عندكم علب برغر؟" ("Do you have burger boxes?")
>
> The bot detects Arabic, searches the catalog via RAG, finds "Burger Box" with 3 variants (Small/Medium/Large), and responds in Arabic with names, sizes, and prices converted to YER. Maryam asks for pictures — the bot sends product images with bilingual captions.

### Scenario 2: Customer Requests the Full Catalog

> **Ahmed** messages: "Send me the full catalog"
>
> The AI detects the `SEND_CATALOG` action, queries all categories and products, and sends a formatted catalog grouped by category with prices — split across multiple messages if needed.

### Scenario 3: Customer Wants to Talk to a Human

> **Customer** says: "I want to place a large order, can I talk to someone?"
>
> The bot detects order intent, mutes itself for this conversation, notifies the owner with conversation context, and tells the customer: "Connecting you with our team…" — The owner takes over directly on WhatsApp. After 12 hours of silence, the bot auto-resumes.

### Scenario 4: Owner Checks Business Status

> **Owner** sends: `!analytics week`
>
> The bot returns a formatted summary: 42 conversations, 87 product searches, 3 human handoffs, average 1.2s response time, top product: Burger Box.

### Scenario 5: First-Time Customer Gets Welcome + Offer

> A new customer messages for the first time. The bot sends a welcome template, then checks for active offers. Finding a 20% discount on containers, it uses AI to craft a natural promotional message and sends it, before answering the customer's actual question.

## 5. Quality Attributes

| Attribute           | Target                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| **Accuracy**        | Responses grounded in real data; no hallucination                         |
| **Availability**    | Auto-restart via PM2; resilient to AI outages via failover chain          |
| **Responsiveness**  | Sub-3-second response time for typical queries                            |
| **Security**        | API auth, input sanitization, prompt injection prevention, data redaction |
| **Scalability**     | Multi-tenant design; each company fully isolated                          |
| **Usability**       | Zero-config for customers; owners manage via simple `!` commands          |
| **Maintainability** | Modular TypeScript codebase, strict types, comprehensive tests            |

## 6. Success Metrics (KPIs)

| Metric                 | Target                     | Measurement                                      |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| Bot resolution rate    | ≥ 80%                      | Messages answered without human handoff          |
| Average response time  | < 3 seconds                | Tracked via `ai_response` analytics events       |
| Customer re-engagement | ≥ 50% return within 7 days | Unique phone numbers with multiple conversations |
| AI cost per tenant     | < $10/month                | Sum of AI API costs per company                  |
| System uptime          | ≥ 99%                      | PM2 uptime tracking                              |
| Owner satisfaction     | Positive feedback          | Direct owner feedback loop                       |

---

_This document is the authoritative reference for project direction, scope boundaries, and success criteria. All implementation decisions should align with the vision and scope defined here._
