# Retrieval Spelling Variation Recovery Plan

## Goal

Recover from failed or weak retrieval when the likely issue is spelling, orthography, or transliteration mismatch between the user query and catalog embeddings.

This plan covers only the single retry recovery path.
It runs after the primary retrieval path and is intentionally separate from intent rewriting.

## Problem

Some retrieval failures are not caused by missing conversational context.
They are caused by string mismatch, for example:
- Arabic spelling variants
- alef / hamza forms
- taa marbuta / haa variation
- spacing differences
- transliteration differences
- English misspellings

In these cases the intent may already be understood, but the embedding query still misses the catalog.

## Scope

In scope:
- one spelling-variation retry per inbound message
- deterministic variation generation
- deterministic clarification suggestions from grounded results
- logging and tests for retry behavior

Out of scope:
- semantic synonym generation
- multiple retries
- broad fuzzy-search infrastructure
- answer-model-generated product suggestions

## Design Principles

1. This is a recovery stage, not the primary retrieval path.
2. It must run at most once per inbound message.
3. It must be triggered by deterministic signals, not by vague model feelings.
4. It must generate spelling variants, not meaning variants.
5. If it succeeds, the response should clarify rather than assume.

## Trigger Conditions

Run the retry only when all of these are true:

1. Primary retrieval already ran.
2. Primary retrieval outcome is:
   - `empty` with `no_hits`, or
   - `low_signal`
3. The message contains at least one candidate product term worth varying.
4. No variation retry has already been attempted for this inbound message.

Do not trigger based on:
- answer-model intuition
- unrelated but non-empty retrieval
- repeated retry loops

## Candidate Term Extraction

Extract candidate terms deterministically from the retrieval input path.

Preferred sources:
- `resolvedQuery` from the rewrite stage
- original user message as fallback

Candidate extraction rules should favor likely product-bearing tokens or phrases, not every token in the message.

## Variation Generation

Variation generation should be deterministic and narrow.

Examples of allowed transformations:
- Arabic normalization
- common orthographic alternates
- transliteration-like alternates when directly plausible
- common English typo correction patterns

Examples of forbidden transformations:
- synonym expansion
- category guessing
- adding attributes not present in the query
- semantic re-interpretation of the request

Keep the candidate set small.

## Retry Behavior

1. Generate a bounded set of variant queries from the candidate terms.
2. Run one recovery retrieval pass.
3. Merge and deduplicate results.
4. If recovery retrieval remains empty or weak, stop and use the normal low-signal fallback behavior.
5. If recovery retrieval finds strong grounded candidates, do not answer as if the match is confirmed.

## Response Policy After Successful Retry

When the variation retry produces good candidates, reply with a deterministic clarification prompt.

Examples of response shapes:
- single clear candidate:
  - "Did you mean Burger Box?"
- a few close candidates:
  - "Did you mean one of these: Burger Box Small, Burger Box Large, Burger Meal Box?"

Rules:
- build suggestions from actual grounded catalog hits only
- show 1 candidate when there is a clear top hit
- show up to 3 when scores are close
- include short distinguishing attributes when needed
- do not let the answer model invent the suggestion list

## Retrieval Provenance

Add a distinct retrieval mode for this path:

```ts
type RetrievalMode =
  | "primary_rewrite"
  | "rewrite_degraded"
  | "spelling_variation_retry";
```

If this mode reaches final prompt assembly, the answer model should be instructed to prefer clarification wording.

## Logging And Metrics

Record:
- whether retry was considered
- whether retry was triggered
- candidate terms
- generated variation count
- final recovery retrieval outcome
- final retrieval mode
- whether a clarification prompt was sent

This is required to prove that the retry helps instead of adding noisy extra searches.

## Implementation Plan

### Step 1: Add Retry Contracts

Define typed structures for:
- retry eligibility
- extracted candidate terms
- generated variations
- retry result

### Step 2: Implement Deterministic Variation Logic

Add a focused utility in `packages/rag` for:
- candidate term extraction
- normalization
- bounded variation generation

Keep it isolated from the LLM rewrite code.

### Step 3: Integrate Retry Into Retrieval Orchestration

After primary retrieval:
- evaluate trigger conditions
- run one retry if eligible
- record provenance
- branch into clarification behavior when recovery succeeds

### Step 4: Add Deterministic Suggestion Builder

Build a small formatter that converts grounded hits into a concise "did you mean ...?" message.

This formatter should not depend on free-form model generation.

### Step 5: Add Tests

Cover:
- trigger eligibility
- one-retry cap
- no retry on successful primary retrieval
- deterministic variant generation
- no semantic expansions
- successful retry leading to clarification
- failed retry falling back cleanly

## Suggested File Targets

Likely touch points:
- `packages/rag/src/index.ts`
- `packages/rag/src/index.test.ts`
- `packages/rag/src/catalogChat.test.ts`

Possibly new files:
- `packages/rag/src/spellingVariationRetry.ts`
- `packages/rag/src/spellingVariationRetry.test.ts`

## Acceptance Criteria

- The system retries at most once per inbound message.
- Retry happens only on clearly failed or weak primary retrieval.
- Variations are spelling- or orthography-based, not semantic guesses.
- Successful retries produce grounded clarification prompts rather than overconfident answers.
- Logs make retry behavior measurable and debuggable.
