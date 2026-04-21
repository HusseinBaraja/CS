# Owner Conversation Session Log Rewrite Plan

This plan rewrites the dev-only owner conversation session log so the file shape matches the approved domain rules without changing the chat pipeline itself. The goal is to log current runtime behavior better, not to invent new AI stages.

## Mission

Make each `bun dev` session produce at most one markdown log file for the owner-number conversation only, with:

- Root-level filename format: `DD-MM-HH-mm.md`
- Local human-readable timestamps like `2026-04-21 11:22:03 AM`
- Header fields exactly: `Session ID`, `Company ID`, `Conversation ID`, `Started At`
- No file at all when no owner-number conversation is logged
- AI background sections that contain:
  - exact system prompt text sent to the API
  - grounding context snapshot when retrieval data is used
  - raw API output
  - provider name and usage only
- No prompt payload in markdown
- No synthetic sections for AI stages the runtime does not actually execute

## Fixed Decisions

- Scope is dev-only session logging.
- Only the conversation whose phone number matches the owner number is eligible for logging.
- The file is a single artifact for the dev session.
- Empty sessions do not create a markdown file.
- The sample file is a formatting target, not a behavioral source of truth.
- The plan must not add language-detection or message-variation API stages just to imitate the sample.
- The multi-owner-conversation-in-one-session edge case is intentionally out of scope.

## Current Reality

### What exists now

- Session ids and paths are built in [packages/core/src/conversationSessionLog.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/core/src/conversationSessionLog.ts:39) and [scripts/dev-session-log.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/scripts/dev-session-log.ts:8).
- The markdown writer eagerly creates the file header at startup in [packages/core/src/conversationSessionLog.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/core/src/conversationSessionLog.ts:81).
- Bot-side log appends happen in [apps/bot/src/customerConversationRouter.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/bot/src/customerConversationRouter.ts:131) and worker-side lifecycle appends happen in [apps/worker/src/pendingAssistantSessionLog.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/worker/src/pendingAssistantSessionLog.ts:12).
- Owner-only gating already exists in [apps/bot/src/customerConversationLogHelpers.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/bot/src/customerConversationLogHelpers.ts:63).

### What is wrong

- Filenames are UUID-like ISO ids, not `DD-MM-HH-mm.md`.
- Header timestamps and entry timestamps are ISO UTC, not local readable time.
- The writer creates empty files before any owner conversation entry exists.
- Background entries are lossy `details` strings, not structured AI sections.
- The writer cannot represent exact system prompt text, grounding context snapshot, raw API output, and provider usage as first-class log data.
- The sample file shows stages that current runtime does not actually execute, so blindly matching it would misrepresent behavior.

### What current runtime really does

- Language detection is local logic in [packages/ai/src/chat/language.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/ai/src/chat/language.ts:80).
- Retrieval rewrite is a real AI call in [packages/rag/src/retrievalRewrite.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/rag/src/retrievalRewrite.ts:264).
- Answer generation is a real AI call in [packages/rag/src/index.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/rag/src/index.ts:968).
- There is no tracked current runtime message-variation API call.

## Target File Contract

### Filename

- One root-level markdown file per dev session
- Name format: `DD-MM-HH-mm.md`
- Derived from local dev-session start time

### File creation rule

- Do not create the file at startup
- Create the file lazily on the first owner conversation entry append

### Header

```md
# Conversation Session Log

- Session ID: `21-04-11-22`
- Company ID: `...`
- Conversation ID: `...`
- Started At: `2026-04-21 11:22:03 AM`
```

### Entry shapes

Customer-visible turn:

```md
- [CV] 2026-04-21 11:22:07 AM actor=assistant

  مرحبا...
```

Lifecycle event without AI call payload:

```md
- [BTS] 2026-04-21 11:22:07 AM event=assistant.committed

  Pending assistant message committed.
```

AI background section:

```md
- [BTS] 2026-04-21 11:22:06 AM event=ai.answer_generation

  System Prompt:
  ...

  Grounding Context:
  ...

  Provider:
  deepseek

  Usage:
  ```json
  { "...": "..." }
  ```

  API Result:
  ```json
  { "...": "..." }
  ```
```

## Design Direction

### 1. Replace generic background details with typed markdown payloads

Do not keep `details: string` as the main abstraction for background logging. Introduce a typed session-log payload model that can represent:

- plain lifecycle notes
- AI call records with exact system prompt text
- optional grounding context snapshot
- raw API output
- provider name
- usage

This belongs in `packages/core`, not bot-only code, because both bot and worker write to the session log.

### 2. Separate session identity from file creation

Keep a dev-session identity that is decided once at `bun dev` startup, but stop binding that identity to eager file creation. The writer should hold session metadata in memory and materialize the file only on first append.

### 3. Capture AI payloads at the true boundaries

Do not reconstruct prompts downstream from logs. Capture them where they are already built:

- retrieval rewrite boundary in `packages/rag/src/retrievalRewrite.ts`
- grounded answer generation boundary in `packages/rag/src/index.ts`

The plan should add logging hooks or structured trace return values at those points so the markdown log receives exact source-of-truth data.

### 4. Keep owner-only filtering at the edge

Do not spread owner-number checks across AI packages. Continue gating at the bot/router edge, then pass a log writer only when the owner-number conversation is active.

### 5. Keep worker events simple

Worker reconciliation events should stay background trace lines, not AI background sections, unless they ever begin issuing real AI calls.

## Rewrite Workstreams

### Workstream A: Session identity and lazy file materialization

Outcome:
The dev session still has one stable id, but the file is not created until the first append.

Changes:

- Replace UUID-like session id generation with local `DD-MM-HH-mm`
- Update path building to emit root-level `${sessionId}.md`
- Change writer initialization so header write happens on first append, not constructor call
- Keep append queue safety for concurrent writes

Likely files:

- [packages/core/src/conversationSessionLog.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/core/src/conversationSessionLog.ts:1)
- [packages/core/src/conversationSessionLog.test.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/core/src/conversationSessionLog.test.ts:1)
- [scripts/dev-session-log.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/scripts/dev-session-log.ts:1)
- [scripts/dev-session-log.test.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/scripts/dev-session-log.test.ts:1)

Tests to add or change:

- session id uses local `DD-MM-HH-mm`
- path points to repo root file
- no file exists before first append
- first append creates header and entry

### Workstream B: Local timestamp rendering and exact header contract

Outcome:
All markdown timestamps use local readable format and the header contains exactly the four approved fields.

Changes:

- Add one shared local timestamp formatter in `packages/core`
- Use it for header `Started At`
- Use it for entry timestamps
- Ensure header fields are emitted in the exact approved order

Tests to add or change:

- local timestamp format is stable
- header contains only the approved four fields
- entry lines use local time rather than ISO UTC

### Workstream C: Typed AI trace model

Outcome:
The writer can render rich AI background sections without downstream string reconstruction.

Changes:

- Introduce a typed `ai` background payload shape alongside plain background notes
- Keep payload shape small and domain-specific
- Render AI sections in markdown with:
  - `System Prompt`
  - `Grounding Context` only when present
  - `Provider`
  - `Usage`
  - `API Result`

Guardrails:

- Do not log prompt payload
- Do not log full provider envelope
- Do not log synthetic stages

Tests to add or change:

- AI section renders exact labels and ordering
- multiline prompt text is preserved
- JSON blocks are fenced correctly
- omitted optional sections stay omitted cleanly

### Workstream D: Real AI capture points in current runtime

Outcome:
The log records only the two real current AI calls with exact data from source.

Changes:

- At retrieval rewrite call site, capture:
  - exact system prompt string
  - retrieval rewrite raw response text
  - provider name and usage if available
- At answer-generation call site, capture:
  - exact system prompt string
  - retrieval grounding context snapshot
  - raw provider response text
  - provider name and usage
- Thread those traces back to the bot session log append path

Likely files:

- [packages/rag/src/retrievalRewrite.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/rag/src/retrievalRewrite.ts:1)
- [packages/rag/src/index.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/rag/src/index.ts:1)
- [apps/bot/src/customerConversationRouter.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/bot/src/customerConversationRouter.ts:1)

Hard requirement:

- No language-detection AI section unless runtime truly makes that AI call
- No message-variation AI section unless runtime truly makes that AI call

Tests to add or change:

- orchestrator returns enough structured trace data for logging
- router appends AI background sections in the right sequence
- fallback branches do not invent missing traces

### Workstream E: Keep worker lifecycle notes compatible

Outcome:
Worker reconciliation keeps writing readable background lines without being forced into AI formatting.

Changes:

- Migrate worker events from generic `details` to the new plain background-note variant
- Preserve current best-effort non-blocking behavior

Likely files:

- [apps/worker/src/pendingAssistantSessionLog.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/worker/src/pendingAssistantSessionLog.ts:1)
- [apps/worker/src/pendingAssistantReconciliation.test.ts](/C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/worker/src/pendingAssistantReconciliation.test.ts:1)

## Execution Order

### Step 1

Do session id, path, lazy file creation, and local timestamp formatting first. This gives the correct file lifecycle and stable markdown shell.

Checkpoint:

- tests for core writer and dev-session env updated
- root plan assumptions reflected in code
- commit

### Step 2

Introduce the typed background payload model and markdown renderer changes in `packages/core`.

Checkpoint:

- rendering tests pass
- worker-compatible plain background events still work
- commit

### Step 3

Add retrieval rewrite and answer-generation trace capture, then wire bot log appends to the richer writer format.

Checkpoint:

- bot and rag tests updated
- real AI stages only
- commit

### Step 4

Adjust worker lifecycle events to the new plain background payload shape and run final verification.

Checkpoint:

- worker tests pass
- no regressions in owner-only gating
- commit

## Verification Matrix

### Core

- `bun test packages/core/src/conversationSessionLog.test.ts`
- `bun test scripts/dev-session-log.test.ts`

### RAG / AI logging

- `bun test packages/rag/src/retrievalRewrite.test.ts`
- `bun test packages/rag/src/catalogChat.test.ts`
- `bun test apps/bot/src/customerConversationRouter.test.ts`

### Worker compatibility

- `bun test apps/worker/src/pendingAssistantReconciliation.test.ts`

### Repo checks after implementation

- `bun check`
- `bun lint`
- `bun run check:modularity`
- `bun run check:root`

Run `bun dev` after implementation to verify the dev-session artifact manually.

## Acceptance Criteria

- Starting `bun dev` without an owner conversation leaves no markdown file behind.
- First owner conversation append creates exactly one root-level file named `DD-MM-HH-mm.md`.
- Header contains exactly `Session ID`, `Company ID`, `Conversation ID`, and `Started At`.
- All timestamps are local and human-readable.
- Only owner-number conversation turns appear in the file.
- AI background sections exist only for real current AI calls.
- Each AI background section includes exact system prompt text, raw API output, provider name, usage, and grounding context when applicable.
- Prompt payload is absent.
- Worker lifecycle entries remain readable background trace lines.

## Non-Goals

- Adding new AI stages to the runtime
- Matching the sample file line-for-line when the sample contradicts current behavior
- Solving multiple owner conversations in one dev session
- Turning the session log into a generalized production audit system
