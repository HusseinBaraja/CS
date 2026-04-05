# Step 5: Retrieval Refactor

## Research Before Drafting
Inspect `packages/rag/src/index.ts`, current vector-search entrypoints, and any retrieval-related tests before revising this step. If retrieval modes, provider limits, or vector-search behavior are uncertain, verify them through the codebase and official docs. Use Context7 MCP where relevant.

## Objective
Refactor retrieval so it consumes resolved intent and entity state rather than raw latest-turn text alone.

## Why This Step Comes Now
Turn resolution must come first. Retrieval cannot become conversation-aware until the system has a canonical standalone query and reference set. This step translates the output of Step 4 into a robust retrieval contract.

## In Scope
- Retrieval request contract
- Retrieval mode selection
- Contextual recovery before user-facing fallback
- Interaction between selected entities and semantic search

## Out Of Scope
- Summary generation
- Retention policy
- Structured-output repair logic
- Rollout implementation details

## Current Problems This Step Addresses
Current retrieval issues include:

- the raw inbound text is used as the retrieval query
- low-signal and empty outcomes are treated too early as final user-facing failures
- selected entities do not strongly shape retrieval
- the system lacks a distinction between direct entity lookup and semantic search

Relevant current code:

- `packages/rag/src/index.ts`
- `convex/vectorSearch.ts`
- `convex/products.ts`

## Target Behavior After This Step
After this step, retrieval becomes a consumer of `ResolvedUserTurn` and `ConversationState`, and it can choose among multiple retrieval modes:

- direct entity lookup
- variant lookup within selected product
- filtered search within selected category
- semantic search across the catalog

`empty` and `low_signal` become internal retrieval results. They do not automatically become final customer-facing replies.

## Planned Interfaces And Data Contracts

### `RetrievalRequest`
Purpose: canonical retrieval input derived from turn resolution and conversation state.

Required fields:

- `standaloneQuery`
- `language`
- `selectedEntityIds`
- `retrievalMode`
- `listContext`
- `resolutionConfidence`
- `clarificationStillPossible`

Introduced in: Step 5  
Consumed by: Steps 8 and 9

Retrieval modes must include:

- `direct_entity_lookup`
- `variant_lookup`
- `filtered_catalog_search`
- `semantic_catalog_search`

## Data Flow And Lifecycle
Planned lifecycle:

1. Receive `ResolvedUserTurn`.
2. Select retrieval mode from state and intent.
3. Execute the mode-specific retrieval path.
4. Produce a `GroundingBundle` with retrieved evidence.
5. If retrieval is weak, attempt contextual recovery before external fallback.
6. Only then decide whether clarification or fallback is necessary.

Contextual recovery may include:

- switching from raw semantic search to direct selected-entity lookup
- constraining search by selected category
- reusing state-selected product when the query is about size, price, or image

## Edge Cases And Failure Modes
- Standalone query points to an entity that no longer exists
- Selected entity exists but variant requested does not
- Semantic search is weak while direct-entity state is strong
- User asks for image and retrieval should use selected product instead of semantic search
- Low confidence in turn resolution and low signal in retrieval combine into a targeted clarification path

## Validation And Test Scenarios
This step owns:

- low-signal raw query but recoverable through selected product state
- empty semantic search but successful direct-entity lookup
- category-constrained follow-up after numbered list selection
- image request on selected product
- variant-size request on selected product family

Each scenario must define:

- `ResolvedUserTurn`
- current state
- selected retrieval mode
- fallback recovery attempts
- expected final retrieval behavior

## Rollout And Observability Requirements
Required metrics:

- retrieval mode distribution
- direct-entity recovery success rate
- low-signal recovery rate
- final clarification rate after recovery attempts
- final handoff rate attributable to unresolved retrieval problems

This step should run in shadow mode first so raw-query retrieval can be compared against resolved-query retrieval.

## Prerequisites
- [Step 4](./step_4_turn_resolution_and_query_rewriting.md)

## Completion Criteria
- `RetrievalRequest` is fully defined.
- Retrieval modes are documented and mapped to intents.
- Internal retrieval outcomes are separated from final user-facing fallback behavior.
- Contextual recovery is documented as mandatory before final fallback.

## What Later Steps Will Rely On From This Step
- Step 8 relies on clearer fallback boundaries.
- Step 9 uses retrieval recovery metrics for rollout evaluation.
- Step 10 uses this step as the replacement for the legacy raw-query retrieval path.
