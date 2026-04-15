# Retrieval Rewrite Dedicated Model Plan

## Goal

Move retrieval-intent rewriting onto its own low-cost runtime configuration instead of sharing the customer-facing answer model chain.

## Problem

The current implementation reuses the same shared chat provider manager for:
- customer-facing answer generation
- retrieval-intent rewriting

That was a pragmatic shortcut, but it creates avoidable coupling:
- rewrite cost scales with the answer-model defaults
- rewrite latency inherits the answer-model fallback chain
- answer-model provider changes can unintentionally change retrieval behavior
- the system cannot tune rewrite for "small, fast, cheap" independently

## Scope

In scope:
- rewrite-specific runtime config and env surface
- rewrite-specific provider/model selection
- `@cs/rag` wiring for the rewrite service
- tests for config resolution and fallback behavior

Out of scope:
- changing the final answer model chain
- provider-wide refactors unrelated to rewrite
- per-tenant custom rewrite model selection

## Design Principles

1. Retrieval rewrite and final answer generation must be configurable independently.
2. Rewrite should default to the cheapest reliable structured-output-capable path.
3. The orchestrator should depend on a narrow rewrite-model abstraction, not provider-specific conditionals.
4. Failure in the rewrite model chain must still degrade safely to deterministic retrieval.
5. Existing deployments should get sensible defaults without breaking env validation.

## Target Behavior

The runtime should expose a dedicated rewrite model policy such as:

```ts
interface RetrievalRewriteRuntimeConfig {
  providerOrder: ("deepseek" | "gemini" | "groq")[];
  modelsByProvider: Partial<Record<"deepseek" | "gemini" | "groq", string>>;
  timeoutMs: number;
}
```

The rewrite service should resolve its provider/model chain from this config instead of inheriting the general chat runtime defaults.

## Configuration Strategy

Add a rewrite-specific config layer with:
- optional env vars for rewrite provider order
- optional env vars for rewrite model names
- rewrite timeout that can be lower than final answer timeout

Fallback policy:
- if rewrite-specific env vars are absent, derive a safe default chain
- do not make new env vars globally required
- preserve current behavior as the final compatibility fallback

## Implementation Plan

### Step 1: Add Rewrite Runtime Contracts

Define a dedicated runtime config type for retrieval rewrite in `@cs/ai` or `@cs/config`.

It should cover:
- provider order
- per-provider model id
- timeout budget

### Step 2: Add Config Resolution

Implement env-backed config resolution with safe optional defaults.

Keep shared config rules in mind:
- do not make new env vars mandatory unless the app already cannot run without them
- keep Convex-safe imports intact

### Step 3: Add Rewrite-Specific Provider Manager Entry Point

Introduce a helper that resolves a provider manager or provider request config specifically for retrieval rewrite.

This should avoid duplicating the whole chat manager implementation.

### Step 4: Rewire `@cs/rag` Rewrite Service

Update the rewrite service so it:
- uses the rewrite-specific runtime config
- logs the selected provider/model separately from final answer generation
- preserves the same degraded fallback behavior on failure

### Step 5: Add Tests

Cover:
- rewrite config defaults
- rewrite-specific env override behavior
- separate provider/model selection from answer generation
- degraded fallback when rewrite provider chain fails

## Suggested File Targets

Likely touch points:
- `packages/config/src/index.ts`
- `packages/ai/src/chat/runtimeConfig.ts`
- `packages/ai/src/index.ts`
- `packages/rag/src/index.ts`
- `packages/rag/src/retrievalRewrite.test.ts`

Possible new files:
- `packages/ai/src/chat/retrievalRewriteRuntime.ts`
- `packages/ai/src/chat/retrievalRewriteRuntime.test.ts`

## Acceptance Criteria

- Retrieval rewrite no longer depends on the final answer model defaults.
- Rewrite provider/model choice can be changed without affecting customer-facing answer generation.
- New config remains optional and does not break `bun generate` or shared startup validation.
- Rewrite failures still degrade to deterministic retrieval exactly as they do now.
