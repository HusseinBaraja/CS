# Retrieval Intent Rewrite Plan

## Goal

Improve catalog retrieval quality by deriving a clearer internal retrieval query from the inbound message plus the already selected conversation slice before running vector search.

This plan covers only the intent-rewrite stage.
It does not cover spelling or orthographic variation fallback. That is handled in a separate plan.

## Problem

The bot already selects the correct conversation slice for the current inbound message:
- recent history when the message depends on nearby context
- a quoted-message slice when the user replied to a specific WhatsApp message

But retrieval still searches using only the raw latest user message.

That creates a mismatch:
- prompt assembly is history-aware
- retrieval is history-blind

When the latest message is referential or underspecified, retrieval can fetch unrelated products. The answer model then receives weak or wrong grounding and produces a bad answer.

## Scope

In scope:
- bot and `@cs/rag` orchestration path
- retrieval-query rewrite contract
- rewrite-model prompt and parsing
- retrieval provenance and logging
- tests for rewrite and degraded fallback behavior

Out of scope:
- API flows
- worker jobs
- spelling-variation retry
- synonym expansion
- catalog schema changes

## Design Principles

1. Every inbound message goes through the rewrite step before primary retrieval.
2. The rewrite step is separate from final answer generation.
3. The rewrite model has a narrow contract and a separate system prompt.
4. The rewrite step may clarify intent, but must not invent catalog facts.
5. Failure in the rewrite step must degrade safely rather than poison retrieval.
6. The final answer prompt must know whether retrieval came from a normal or degraded path.

## High-Level Flow

1. Bot persists inbound message and selects the conversation slice exactly as it does now.
2. RAG orchestrator receives:
   - `userMessage`
   - selected `history`
   - tenant context
3. New rewrite stage runs before `retrieveCatalogContext`.
4. Rewrite stage returns structured output.
5. Orchestrator builds one primary retrieval query and optional grounded aliases.
6. Retrieval runs on that query set.
7. Retrieved context and retrieval provenance go into final answer generation.

## Rewrite Inputs

The rewrite model should receive a tightly labeled payload with only the information needed to resolve the active referent:

- `current_user_message`
- `selected_history`
- `history_selection_reason`
  - `recent_window`
  - `quoted_reply_slice`
  - `empty`
- `quoted_message`
  - only when present
- `response_language_hint`
- `catalog_language_hints`
  - only if this helps bilingual rewriting

Do not pass:
- retrieved catalog items
- raw vector hits
- full lifetime conversation history
- internal database identifiers not needed for reasoning

## Rewrite Output Contract

Use strict structured output. Suggested schema:

```ts
type RetrievalRewriteConfidence = "high" | "medium" | "low";

type RetrievalRewriteStrategy =
  | "standalone"
  | "recent_history_resolution"
  | "quoted_reply_resolution";

type RetrievalRewriteUnresolvedReason =
  | "missing_referent"
  | "ambiguous_reference"
  | "insufficient_history"
  | "unclear_product_target";

interface RetrievalRewriteResult {
  resolvedQuery: string;
  confidence: RetrievalRewriteConfidence;
  rewriteStrategy: RetrievalRewriteStrategy;
  preservedTerms: string[];
  searchAliases?: string[];
  unresolvedReason?: RetrievalRewriteUnresolvedReason;
  notes?: string;
}
```

Rules:
- `resolvedQuery` is required
- preserve user language in `resolvedQuery`
- `searchAliases` are optional and tightly capped
- aliases must be grounded in the conversation slice
- no speculative product attributes or category expansion

## Rewrite Model Prompt Requirements

The system prompt for the rewrite model should explicitly say:

- your job is to improve retrieval, not answer the user
- use only the current message and selected history
- resolve references like "the third one", "that one", or quoted replies
- preserve uncertainty instead of inventing details
- do not add product facts that are not supported by the conversation
- preserve the user language in the main query
- output only the required schema

The rewrite model should be:
- small
- fast
- cheap
- reliable with structured output

## Retrieval Behavior

Primary retrieval should use:
- `resolvedQuery`

Optional secondary retrieval may use:
- `searchAliases`, capped to 1-2

Merge results across the query set:
- deduplicate by product
- preserve the highest score per product
- keep provenance about which query produced the hit

## Degraded Fallback Behavior

If the rewrite stage fails because of invalid output, parse failure, timeout, or `low` confidence:

1. Do not trust the rewrite blindly.
2. Mark retrieval mode as degraded.
3. Fall back to deterministic retrieval input:
   - first choice: original user message
   - second choice when quoted message exists: a plain combined fallback query from quoted message plus current message

This path should still run retrieval instead of immediately failing the user request.

## Retrieval Provenance

Carry retrieval provenance through orchestration and into final prompt assembly.

Suggested modes:

```ts
type RetrievalMode =
  | "primary_rewrite"
  | "rewrite_degraded";
```

Prompt policy:
- if `rewrite_degraded`, the answer model should stay conservative
- weak grounding should favor clarification over confident answering

## Logging And Metrics

Record structured fields per inbound message:
- rewrite outcome
- rewrite confidence
- rewrite strategy
- unresolved reason
- alias count
- primary retrieval outcome
- top score
- final retrieval mode
- final response branch

This is required to determine whether the rewrite step improves retrieval or only adds latency and cost.

## Implementation Plan

### Step 1: Add Contracts

Implement new shared types in `packages/rag` for:
- rewrite input shape
- rewrite output shape
- retrieval mode / provenance

Keep contracts narrow and test them first.

### Step 2: Add Rewrite Service Interface

Introduce a rewrite service abstraction in `packages/rag`, similar to the existing retrieval and chat abstractions.

Example responsibilities:
- accept the labeled rewrite input
- call the selected small model
- parse and validate structured output
- return a typed result or a typed failure

### Step 3: Integrate Into Orchestrator

Update the catalog chat orchestrator so the flow becomes:

1. detect language
2. build rewrite input from `userMessage` and selected history
3. call rewrite service
4. derive retrieval queries from rewrite result or degraded fallback
5. run retrieval
6. build final prompt with retrieval provenance
7. call final answer model

### Step 4: Support Alias Queries

Allow retrieval orchestration to run the primary query plus optional aliases.

Do not expose alias logic to the final answer model except through retrieval provenance and grounded context.

### Step 5: Add Logging

Emit structured rewrite and retrieval-provenance logs from `@cs/rag`.

### Step 6: Test Coverage

Add or update tests for:
- rewrite input assembly from recent history
- rewrite input assembly from quoted history
- valid structured rewrite result
- invalid structured rewrite result
- low-confidence rewrite result
- degraded fallback query selection
- alias query merge and dedupe
- prompt assembly including retrieval provenance

## Suggested File Targets

Likely touch points:
- `packages/rag/src/index.ts`
- `packages/rag/src/index.test.ts`
- `packages/rag/src/catalogChat.test.ts`
- `apps/bot/src/customerConversationRouter.test.ts`

Possibly new files:
- `packages/rag/src/retrievalRewrite.ts`
- `packages/rag/src/retrievalRewrite.test.ts`

## Acceptance Criteria

- Referential messages retrieve items tied to the active conversational referent more reliably than the current raw-message search path.
- Standalone product queries still work through the new rewrite stage.
- Rewrite failures do not break retrieval.
- Final answer generation can distinguish normal retrieval from degraded retrieval.
- Logs make rewrite quality and retrieval quality diagnosable.
