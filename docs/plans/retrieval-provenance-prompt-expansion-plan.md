# Retrieval Provenance Prompt Expansion Plan

## Goal

Expose richer retrieval-query provenance to the final answer prompt so the answer model can reason about grounding strength more precisely than the current coarse mode flag.

## Problem

The current prompt only sees:
- `primary_rewrite`
- `rewrite_degraded`

That is useful, but incomplete.
The answer model still cannot tell:
- whether the winning hits came from the primary rewritten query or an alias
- whether degraded retrieval came from the original message or a quoted-message fallback
- whether multiple query paths converged on the same products

This limits conservative response behavior when grounding is mixed or indirect.

## Scope

In scope:
- prompt contract changes
- retrieval provenance summarization
- prompt assembly updates
- tests for prompt-visible provenance

Out of scope:
- exposing raw vector scores directly to the model
- dumping full retrieval logs into prompts
- changing retrieval ranking itself

## Design Principles

1. Prompt provenance should be compact, typed, and decision-useful.
2. Only grounded retrieval facts should be exposed to the answer model.
3. The prompt should communicate certainty without overloading context length.
4. Provenance should distinguish query source, not just final mode.
5. Internal logs can stay richer than the prompt contract.

## Proposed Prompt Contract

Add a compact provenance object such as:

```ts
type PromptRetrievalQuerySource =
  | "resolved_query"
  | "search_alias"
  | "original_message_fallback"
  | "quoted_message_fallback";

interface PromptRetrievalProvenance {
  mode: "primary_rewrite" | "rewrite_degraded";
  primarySource: PromptRetrievalQuerySource;
  supportingSources: PromptRetrievalQuerySource[];
  usedAliasCount: number;
  convergedOnSharedProducts: boolean;
}
```

The prompt should receive only a summarized form, not the entire retrieval result graph.

## Prompt Policy

The answer model should be instructed to behave differently when:
- all top hits came from `resolved_query`
- top hits depend mainly on `search_alias`
- degraded fallback was required
- products were found only through quoted-message fallback

Expected behavior:
- direct resolved-query grounding can answer normally
- alias- or fallback-driven grounding should bias toward clarification and cautious wording

## Implementation Plan

### Step 1: Expand Shared Prompt Contracts

Add a typed prompt-facing provenance object in `@cs/ai`.

Keep it narrower than the internal `@cs/rag` provenance data.

### Step 2: Build a Summarizer in `@cs/rag`

Add a helper that converts merged retrieval provenance into the prompt-safe summary.

This is where source prioritization rules should live.

### Step 3: Update Prompt Assembly

Thread the summarized provenance into:
- prompt contracts
- prompt rendering
- system instructions for conservative behavior

### Step 4: Add Tests

Cover:
- direct primary rewrite provenance
- alias-supported provenance
- original-message degraded fallback
- quoted-message degraded fallback
- multi-source convergence

## Suggested File Targets

Likely touch points:
- `packages/ai/src/chat/promptContracts.ts`
- `packages/ai/src/chat/prompt.ts`
- `packages/ai/src/chat/prompt.test.ts`
- `packages/rag/src/index.ts`
- `packages/rag/src/catalogChat.test.ts`

Possible new files:
- `packages/rag/src/retrievalProvenance.ts`
- `packages/rag/src/retrievalProvenance.test.ts`

## Acceptance Criteria

- The final answer prompt can distinguish alias-driven grounding from direct rewritten-query grounding.
- The prompt can distinguish original-message degraded fallback from quoted-message degraded fallback.
- Prompt provenance stays concise and does not expose raw retrieval internals.
- Tests prove that provenance changes the prompt-visible grounding signals deterministically.
