# Software Requirements Specification (SRS)

## CSCB — Customer Service Chatbot

---

## 1. Introduction
### 1.1 Scope

CSCB enables multiple businesses to deploy intelligent WhatsApp chatbots through a single application instance. Each tenant (company) has its own product catalog, conversation history, AI configuration, and analytics — all managed through a REST API and WhatsApp owner commands.

## 2. Overall Description

### 2.1 System Context

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌──────────────┐
│  WhatsApp   │◄───►│         CSCB Application         │◄───►│ Convex Cloud │
│  (Customers │     │  (Bun + TypeScript + PM2)        │     │ (DB, Vectors,│
│   & Owners) │     │                                  │     │  Storage)    │
└─────────────┘     │  ┌──────┐  ┌─────┐  ┌─────────┐  │     └──────────────┘
                    │  │Hono  │  │ AI  │  │ RAG     │  │
┌─────────────┐     │  │API   │  │Mgr  │  │Pipeline │  │     ┌──────────────┐
│  REST API   │◄───►│  └──────┘  └─────┘  └─────────┘  │◄───►│ AI Providers │
│  Consumers  │     └──────────────────────────────────┘     │ (DeepSeek,   │
└─────────────┘                                              │  Gemini,Groq)│
                                                             └──────────────┘
```

