# Reda

Reda is a multi-tenant WhatsApp customer-service platform with AI-grounded catalog replies, human handoff, and worker-driven recovery flows.

## Language

**Company**:
A business using Reda with its own catalog, conversations, runtime session, owner phone, settings, media, offers, currency rates, and analytics.
_Avoid_: Account, shop, business account

**Tenant**:
The isolation boundary that keeps one company's data and runtime behavior separate from every other company.
_Avoid_: Workspace, organization

**Customer**:
A WhatsApp contact who asks a company about products or support.
_Avoid_: Client, buyer, user

**Owner**:
The company-side human who receives handoff notifications and can answer customers when automation should stop.
_Avoid_: Admin, agent, operator

**Operator**:
A technical user who seeds data, runs backups, pairs bot sessions, checks runtime health, or recovers failed side effects.
_Avoid_: Owner

**Conversation**:
A tenant-scoped WhatsApp message history between one customer and one company.
_Avoid_: Chat thread, ticket

**Conversation Turn**:
One accepted inbound Customer message processed through persistence, prompt history, Grounded Answer generation, pending assistant delivery, Handoff side effects when needed, and history trimming.
_Avoid_: Router flow, message pipeline

**Handoff**:
A conversation state where automation is muted and the owner is notified because a human response is requested or safer.
_Avoid_: Escalation failure

**Runtime Session**:
The per-company WhatsApp bot connection state, including pairing, leases, QR availability, reconnect attempts, and session artifacts.
_Avoid_: Bot instance

**Grounded Answer**:
An assistant response based only on retrieved catalog records and allowed business data.
_Avoid_: AI answer, generated answer

**Catalog Import**:
The dashboard workflow where an owner or operator uploads a spreadsheet of company catalog records for later validation and storage.
_Avoid_: Upload data, business settings import

## Relationships

- A **Company** is the primary code and data entity for tenant-scoped records.
- A **Tenant** is the architectural isolation boundary around exactly one **Company**.
- A **Company** has many **Customers** through **Conversations**.
- A **Conversation** belongs to exactly one **Company** and exactly one **Customer**.
- A **Conversation Turn** belongs to exactly one **Conversation** and begins from one accepted inbound **Customer** message.
- A **Handoff** mutes exactly one **Conversation** until the owner handles it or auto-resume applies.
- A **Runtime Session** belongs to exactly one **Company**.
- A **Grounded Answer** may be sent only when retrieved company catalog data is sufficient.
- A **Catalog Import** belongs to exactly one **Company** and must not include business settings or cross-company data.

## Example dialogue

> **Dev:** "Should this API route list all tenant products?"
> **Domain expert:** "No. Use the **Company** id in the request context, then return only products inside that **Tenant** boundary."

## Flagged ambiguities

- "Tenant" and "company" can sound interchangeable. Resolution: use **Company** for code/data entities and **Tenant** for the isolation concept.
