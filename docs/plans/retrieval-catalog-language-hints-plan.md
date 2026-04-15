# Retrieval Catalog Language Hints Plan

## Goal

Wire real tenant-specific catalog language metadata into retrieval-intent rewriting so bilingual query resolution can stay grounded in what the catalog actually contains.

## Problem

The rewrite contract already has `catalogLanguageHints`, but the current implementation does not provide real values.

That leaves the rewrite stage without a useful signal for cases like:
- Arabic user asking about a catalog stored mostly in English product names
- English user referring to Arabic-transliterated catalog terms
- mixed-language catalogs where the rewrite should preserve the right anchor terms

Without real catalog-language hints, the field is only decorative.

## Scope

In scope:
- defining the source of truth for catalog language hints
- exposing that metadata to the bot/RAG path
- threading hints into rewrite input
- tests for multilingual hint behavior

Out of scope:
- automatic catalog translation
- changing embedding models
- schema changes larger than the minimum metadata needed

## Design Principles

1. Catalog language hints must be derived from real tenant data, not guessed ad hoc in the rewrite prompt.
2. The signal should be cheap to compute and cheap to read at request time.
3. Hints should be coarse and reliable, not overly granular.
4. Request-time orchestration should not need to scan the whole catalog.
5. Missing hints must degrade cleanly to the current behavior.

## Source of Truth Options

Preferred options, in order:

1. Persist tenant-level catalog language metadata derived during catalog ingest or reindex.
2. If that does not exist yet, derive a cheap tenant-level summary from existing catalog/product fields and cache it.

Avoid:
- scanning all products on every inbound message
- relying on LLM guesses about catalog language

## Proposed Hint Shape

Use a narrow rewrite-facing contract such as:

```ts
interface CatalogLanguageHints {
  primaryCatalogLanguage: "ar" | "en" | "mixed" | "unknown";
  supportedLanguages: ("ar" | "en")[];
  preferredTermPreservation: "user_language" | "catalog_language" | "mixed";
}
```

The rewrite model does not need raw product text, only a compact summary.

## Implementation Plan

### Step 1: Choose and Document the Source of Truth

Decide where catalog language hints should come from:
- existing tenant metadata
- derived catalog stats
- or a small new derived field

Document update triggers such as product create, update, import, or reindex.

### Step 2: Add a Read Path for Request-Time Use

Expose the tenant’s catalog language hints through the path already used to assemble catalog-chat context.

This should be one cheap read, not a catalog scan.

### Step 3: Thread Hints Into Rewrite Input

Update the bot/RAG orchestration contract so `catalogLanguageHints` is populated when available.

### Step 4: Tune Rewrite Prompt Guidance

Adjust rewrite instructions so hints influence:
- term preservation
- bilingual alias generation
- cautious handling of mixed-language catalogs

### Step 5: Add Tests

Cover:
- Arabic catalog hints
- English catalog hints
- mixed catalog hints
- missing hints degrading to current behavior
- rewrite input assembly including tenant hints

## Suggested File Targets

Likely touch points:
- `convex/*` catalog or company metadata modules
- `apps/bot/src/customerConversationRouter.ts`
- `packages/rag/src/retrievalRewrite.ts`
- `packages/rag/src/retrievalRewrite.test.ts`

Possible new files:
- `convex/catalogLanguageHints.ts`
- `packages/rag/src/catalogLanguageHints.ts`

## Acceptance Criteria

- Retrieval rewrite receives real tenant-specific catalog language hints when available.
- Request-time language-hint lookup does not require scanning the catalog.
- Mixed-language catalogs produce stable, bounded rewrite behavior.
- Missing metadata degrades cleanly without breaking retrieval.
