# Step 4: Turn Resolution and Query Rewriting

## Research Before Drafting
Inspect `packages/rag/src/index.ts`, `apps/bot/src/customerConversationRouter.ts`, `convex/conversations.ts`, and the prompt assembly path before revising this step. If current provider behavior for reasoning, structured output, or intent resolution is uncertain, verify it via current official docs and Context7 MCP where appropriate.

## Objective
Resolve ambiguous inbound turns into standalone intent before retrieval so the system no longer treats every message as an isolated search query.

## Why This Step Comes Now
This step depends on having canonical state, semantic assistant records, and a typed context-assembly contract. Without those foundations, rewriting would still be forced to infer too much from raw message text.

## In Scope
- Resolution of ambiguous follow-up language
- Standalone query generation
- Reference extraction from recent turns, state, summary, and quotes
- Confidence and clarification decision boundaries

## Out Of Scope
- Retrieval implementation changes
- Summary generation policy
- Structured-output hardening
- Rollout mechanics

## Current Problems This Step Addresses
Current retrieval is driven by the latest inbound message text, which breaks for turns such as:

- `الثاني`
- `هذا`
- `منه الكبير`
- `what sizes does it come in`
- `send its picture`

The current system may include recent history in the model prompt, but retrieval happens too early to benefit from that context. This is the central architectural issue behind the bot feeling stateless.

Relevant current code:

- `packages/rag/src/index.ts`
- `convex/conversations.ts`

## Target Behavior After This Step
After this step, every inbound turn first produces a canonical resolution result that answers:

- what the user is asking
- which entities they are referring to
- whether the request is resolvable without clarification
- what standalone query should drive later retrieval

Retrieval may no longer run directly on raw inbound text once this step is active.

## Planned Interfaces And Data Contracts

### `ResolvedUserTurn`
Purpose: canonical resolution of the current inbound turn before retrieval.

Required fields:

- `rawInboundText`
- `resolvedIntent`
- `standaloneQuery`
- `referencedEntityIds`
- `resolutionConfidence`
- `clarificationRequired`
- `contextSourcesUsed`
- `language`

`contextSourcesUsed` must distinguish:

- recent turns
- canonical state
- rolling summary
- quoted reply metadata
- explicit user text only

Introduced in: Step 4  
Consumed by: Step 5 and later prompt assembly

## Data Flow And Lifecycle
Planned lifecycle:

1. Load recent turns, state, and summary.
2. Resolve the inbound turn against those sources.
3. Produce `ResolvedUserTurn`.
4. If confidence is sufficient, pass the standalone query to retrieval.
5. If confidence is insufficient, emit a targeted clarification requirement instead of broad ambiguity handling.

Resolution priority:

1. explicit quoted reference
2. explicit selected entity in state
3. most recent presented list and index mapping
4. recent-turn discourse
5. summary as long-range support
6. raw text only as the weakest source

## Edge Cases And Failure Modes
- User references “the second one” after multiple lists were shown
- User references a deleted product that still exists in summary or state
- User says “same as before” but the last two candidate referents conflict
- User follows up after idle gap and only stable state should remain
- Mixed-language follow-up where Arabic and English terms refer to the same entity

## Validation And Test Scenarios
This step owns the following scenarios:

- numbered referent resolution in Arabic
- pronoun-based follow-up in English
- picture request referring to a selected product
- size query referring to a selected variant family
- same-turn ambiguity that still requires clarification

Each scenario must define:

- recent turns
- current state
- optional summary
- inbound text
- expected `ResolvedUserTurn`
- expected clarification requirement if any

## Rollout And Observability Requirements
Later implementation must measure:

- resolution success rate
- clarification-required rate
- context source usage distribution
- mismatch rate between raw-query retrieval and resolved-query retrieval in shadow mode

This step should be introduced in shadow mode before becoming authoritative for retrieval.

## Prerequisites
- [Step 1](./step_1_canonical_conversation_state.md)
- [Step 2](./step_2_semantic_assistant_turn_persistence.md)
- [Step 3](./step_3_context_assembly_contract.md)

## Completion Criteria
- `ResolvedUserTurn` is fully defined.
- Resolution order across context sources is explicit.
- Retrieval is formally forbidden from consuming raw inbound text directly after this step.
- Validation cases cover numbered references, pronouns, and idle-gap behavior.

## What Later Steps Will Rely On From This Step
- Step 5 uses the standalone query and referenced entities.
- Step 8 uses clarification confidence boundaries.
- Step 9 uses contextual resolution metrics for rollout.
