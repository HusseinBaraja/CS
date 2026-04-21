# CSCB

CSCB is a multi-tenant WhatsApp customer-support platform with AI-grounded catalog replies, human handoff, and worker-driven recovery flows.

## Language

**Customer-view log line**:
A markdown line that records a customer-visible conversation turn exactly as seen by the customer or owner.
_Avoid_: raw app log, transport trace

**Background trace line**:
A markdown line that records lifecycle work tied to a conversation but not shown directly as a chat turn to the customer.
_Avoid_: customer message, visible reply

**Conversation session log filename**:
The markdown filename for a dev session log, formatted from the local dev-session start time as `DD-MM-HH-mm.md`.
_Avoid_: UUID log name, ISO timestamp filename

**Conversation session log timestamp**:
The human-readable local timestamp used inside the markdown log, formatted like `2026-04-21 11:22:03 AM`.
_Avoid_: ISO UTC timestamp, raw epoch time

**Conversation session log header**:
The metadata block at the top of the markdown log that contains exactly `Session ID`, `Company ID`, `Conversation ID`, and `Started At`.
_Avoid_: extra header fields, missing identity fields

**AI background section**:
A background trace section for one AI call that stores the exact system prompt text sent to the API, the grounding context snapshot when retrieval data was used, the raw API output, and only the provider name and usage from provider metadata, but only for AI calls that the current runtime already makes.
_Avoid_: prompt payload, full provider response envelope

## Relationships

- A **Customer-view log line** belongs to exactly one conversation turn.
- A **Background trace line** belongs to exactly one conversation lifecycle event.
- A conversation session log contains both **Customer-view log lines** and **Background trace lines** for exactly one owner-number conversation during one dev session.
- A **Conversation session log filename** identifies exactly one dev session log file.
- A **Conversation session log timestamp** is rendered for the log header and every markdown entry in local time.
- A **Conversation session log header** identifies the session and the one recorded owner conversation.
- An **AI background section** belongs to exactly one AI call inside a **Background trace line**.
- A conversation session log file is created only after the first owner-number conversation entry exists.

## Example dialogue

> **Dev:** "Should the worker replayed owner notification be logged as a customer message?"
> **Domain expert:** "No. The visible assistant/customer text is a **Customer-view log line**. The replay itself is a **Background trace line**."

## Flagged ambiguities

- "background generated" was ambiguous between visible assistant text and invisible lifecycle work — resolved: visible turns are **Customer-view log lines**, while pending, replay, analytics, trim, and owner-notification lifecycle records are **Background trace lines**.
- "convo logs file" was ambiguous between a global dev transcript and a per-conversation artifact — resolved: a **conversation session log** is one markdown file produced for one `bun dev` session, and it records only the conversation whose phone number matches the owner number.
- "same as 21-04-11-22.md file name" was ambiguous between example-only naming and a stable contract — resolved: the **Conversation session log filename** is the required contract and uses local dev-session start time.
- "grounding context" was ambiguous between prompt scaffolding and retrieval evidence — resolved: in an **AI background section**, grounding context means the vector-search result data included for the AI call, while prompt payload is omitted.
- "same as 21-04-11-22.md contents" was ambiguous between reproducing that sample exactly and logging current behavior — resolved: the plan must only improve logging of the current runtime and must not add new AI stages just to match the sample.
- "same as 21-04-11-22.md timestamps" was ambiguous between approximate readability and exact format — resolved: use the **Conversation session log timestamp** format in local time for headers and entries.
- "one file per dev session" was ambiguous about empty sessions — resolved: no file is created when the owner-number conversation never produces a logged entry.
- "same header as the sample" was ambiguous about which fields are required — resolved: the **Conversation session log header** contains exactly `Session ID`, `Company ID`, `Conversation ID`, and `Started At`.
- "multiple owner conversations in one dev session" is intentionally out of scope for this plan and should not drive the logging design.
