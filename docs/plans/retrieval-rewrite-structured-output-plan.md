# Retrieval Rewrite Structured Output Hardening Plan

## Goal

Replace the current plain chat-plus-manual-JSON parsing path for retrieval rewrite with provider-enforced structured output wherever the selected provider supports it.

## Problem

The current rewrite flow validates JSON strictly after generation, which is workable but still a compromise:
- providers are free to emit malformed JSON
- parser recovery logic becomes part of core reliability
- schema drift is detected late
- prompt wording has to do more enforcement work than necessary

For a narrow machine-to-machine rewrite stage, structured output should be enforced by the model interface, not mainly by post-processing.

## Scope

In scope:
- shared rewrite output schema definition
- provider capability mapping for structured output
- rewrite service integration
- fallback behavior when native structured output is unavailable
- tests for success and failure paths

Out of scope:
- rewriting the entire chat provider stack
- adopting structured output for unrelated answer-generation prompts
- removing degraded fallback behavior

## Design Principles

1. The rewrite schema should have one source of truth.
2. Native structured output should be preferred over prompt-only formatting instructions.
3. Provider differences should be hidden behind adapters, not leaked into orchestration logic.
4. Unsupported providers must fail safe or use an explicit compatibility path.
5. Validation still matters, but it should verify provider output rather than rescue arbitrary text.

## Capability Strategy

Introduce a capability-aware rewrite execution path:
- if provider supports native JSON/schema mode, use it
- if provider does not, either:
  - skip that provider for rewrite, or
  - use a clearly marked compatibility fallback temporarily

The choice should be explicit in config, not accidental.

## Schema Strategy

Define the rewrite schema once and use it for:
- provider structured-output requests
- runtime validation
- tests

Prefer a schema representation already used in the codebase, such as Zod, if that fits the current provider utilities cleanly.

## Implementation Plan

### Step 1: Extract a Shared Rewrite Schema

Move the rewrite result definition to a single schema-backed contract that can drive both types and validation.

### Step 2: Add Provider Capability Mapping

Define which providers/models support structured output for this use case and how to invoke it.

This should live near the provider manager layer, not inside `@cs/rag`.

### Step 3: Add Structured Rewrite Invocation Path

Update the rewrite service so it requests structured output from supported providers using the shared schema.

### Step 4: Define Compatibility Fallback Rules

Explicitly decide what happens when the configured rewrite provider lacks structured output:
- skip provider
- use next provider
- or use the current manual JSON path behind a clearly named compatibility branch

### Step 5: Add Tests

Cover:
- successful structured output path
- schema validation failure
- unsupported-provider handling
- timeout/provider failure degrading safely
- compatibility fallback, if retained

## Suggested File Targets

Likely touch points:
- `packages/rag/src/retrievalRewrite.ts`
- `packages/rag/src/retrievalRewrite.test.ts`
- `packages/ai/src/chat/*`

Possible new files:
- `packages/rag/src/retrievalRewriteSchema.ts`
- `packages/ai/src/chat/structuredOutputCapabilities.ts`

## Acceptance Criteria

- Retrieval rewrite uses provider-enforced structured output on supported providers.
- The rewrite schema has a single source of truth for typing and validation.
- Unsupported or failing providers still degrade safely to deterministic retrieval.
- The orchestrator does not need provider-specific branching logic.
