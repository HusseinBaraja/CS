# CSCB

CSCB is a multi-tenant WhatsApp customer-support platform with AI-grounded catalog replies, human handoff, and worker-driven recovery flows.

## Language

**Customer-view log line**:
A markdown line that records a customer-visible conversation turn exactly as seen by the customer or owner.
_Avoid_: raw app log, transport trace

**Background trace line**:
A markdown line that records lifecycle work tied to a conversation but not shown directly as a chat turn to the customer.
_Avoid_: customer message, visible reply

## Relationships

- A **Customer-view log line** belongs to exactly one conversation turn.
- A **Background trace line** belongs to exactly one conversation lifecycle event.
- A conversation session log contains both **Customer-view log lines** and **Background trace lines** for the same dev session.

## Example dialogue

> **Dev:** "Should the worker replayed owner notification be logged as a customer message?"
> **Domain expert:** "No. The visible assistant/customer text is a **Customer-view log line**. The replay itself is a **Background trace line**."

## Flagged ambiguities

- "background generated" was ambiguous between visible assistant text and invisible lifecycle work — resolved: visible turns are **Customer-view log lines**, while pending, replay, analytics, trim, and owner-notification lifecycle records are **Background trace lines**.
