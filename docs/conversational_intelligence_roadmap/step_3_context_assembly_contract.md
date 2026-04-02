# Step 3: Context Assembly Contract

## Research Before Drafting
Inspect `packages/ai/src/chat/prompt.ts`, `packages/rag/src/index.ts`, and the conversation-history retrieval flow before revising this step. If provider support for prompt-layering or system-message handling is uncertain, verify with current official docs and use Context7 MCP where relevant.

## Objective
Define and implement the exact prompt-assembly layers so future work does not collapse summary, state, history, and grounding into one untyped prompt blob.

## Why This Step Comes Now
State and semantic persistence must exist conceptually before prompt assembly can be formalized. This step creates the contract that later turn resolution, retrieval, and summary work will plug into, and it replaces the older grounded-prompt API with the typed assembly boundary.

## In Scope
- Typed prompt-layer definitions
- Separation of memory and grounding responsibilities
- Prompt-assembly input and output contracts
- Layer metadata and omission tracking
- Immediate migration of the active prompt builder to the new contract

## Out Of Scope
- Query rewriting behavior
- Retrieval implementation details beyond the assembly boundary
- Summary generation policy
- Provider-specific prompt optimizations
- Real token-budget enforcement

## Current Problems This Step Addresses
The current prompt builder already includes system instructions, recent history, and grounding blocks, but the assembly contract is too narrow for the future architecture:

- There is no summary layer.
- There is no canonical conversation-state layer.
- Grounding facts and conversational context are not explicitly distinguished as typed conceptual layers.
- Later contributors could easily merge everything into one text blob, making evaluation and budgeting difficult.

Relevant current code:

- `packages/ai/src/chat/prompt.ts`
- `packages/rag/src/index.ts`

## Target Behavior After This Step
After this step, the project has a typed context-assembly contract with distinct responsibilities:

- behavior instructions tell the model how to behave
- summary gives durable long-range memory
- canonical state gives machine-usable current context
- recent turns preserve local discourse
- grounding facts provide current factual evidence
- current user turn remains the final user-owned input

This contract becomes the foundation for later token-budget policy and structured-output hardening.

## Planned Interfaces And Data Contracts

### `ConversationSummaryDto`
Purpose: durable long-range memory layer used in prompt assembly.

Required fields:

- `summaryId`
- `conversationId`
- `durableCustomerGoal`
- `stablePreferences`
- `importantResolvedDecisions`
- `historicalContextNeededForFutureTurns`
- `freshness`
- `provenance`
- `coveredMessageRange`

Introduced in: Step 3 as a prompt-layer DTO  
Implemented behaviorally in: Step 6

### `CatalogGroundingBundle`
Purpose: current factual evidence injected for catalog-claim grounding.

Required fields:

- `bundleId`
- `retrievalMode`
- `resolvedQuery`
- `entityRefs`
- `contextBlocks`
- `language`
- `retrievalConfidence`
- `products`
- `categories`
- `variants`
- `offers`
- `pricingFacts`
- `imageAvailability`
- `omissions`

Introduced in: Step 3  
Consumed by: Steps 5, 5.5, 8

### `PromptBehaviorInstructions`
Purpose: typed behavior layer that isolates policy from memory and grounding.

Required fields:

- `responseLanguage`
- `allowedActions`
- `groundingPolicy`
- `ambiguityPolicy`
- `handoffPolicy`
- `offTopicPolicy`
- `stylePolicy`
- `responseFormat`

Introduced in: Step 3  
Consumed by: Steps 4, 8, 9

### `PromptAssemblyInput`
Purpose: canonical typed input to the prompt builder.

Required fields:

- `behaviorInstructions`
- `conversationSummary`
- `conversationState`
- `recentTurns`
- `groundingBundle`
- `currentUserTurn`

Introduced in: Step 3  
Consumed by: Steps 4, 5, 6, 8

### `PromptAssemblyOutput`
Purpose: assembled prompt plus layer metadata for debugging and budgeting.

Required fields:

- `messages`
- `layerMetadata`
- `tokenBudgetByLayer`
- `omittedContext`

Introduced in: Step 3  
Consumed by: Steps 7, 8, 9

## Data Flow And Lifecycle
Planned lifecycle:

1. Later stages produce typed context objects.
2. Prompt assembly receives typed inputs, not ad hoc strings.
3. Each layer is assembled in a fixed conceptual order.
4. Assembly records which layers were present, omitted, or truncated.

Conceptual layer order:

1. behavior instructions
2. conversation summary
3. canonical conversation state
4. recent turns
5. grounding facts
6. current user turn

Concrete message order:

1. system message for behavior instructions
2. system message for summary when present
3. system message for canonical state when present
4. prior user and assistant turns from `recentTurns`
5. final user message containing the grounding bundle block followed by the current user turn block

Rules:

- Summary may not be treated as canonical state.
- Grounding facts may not be treated as memory.
- Recent turns may not be treated as the only source of conversational meaning.
- Summary and state may not be merged into the final user message.
- Grounding facts may not be rendered as system instructions.
- The final prompt request must remain traceable back to typed layer inputs.

## Edge Cases And Failure Modes
- Summary missing but state present
- State present with `currentFocus.kind = "none"`
- Retrieval returns no grounding bundle
- Retrieval produces a bundle with zero grounding blocks
- Prompt assembly exceeds budget and must omit low-priority context later
- Quoted stale reference present while recent-turn window is short

## Validation And Test Scenarios
Minimum scenarios:

- Prompt assembled with all layers present
- Prompt assembled with missing summary but intact state and grounding
- Prompt assembled with no grounding facts and explicit omission metadata
- Prompt-layer metadata correctly records present and omitted layers
- Arabic and English requests produce equivalent layer boundaries
- Canonical state layer remains present even when current focus is `none`

## Rollout And Observability Requirements
Later implementation must measure:

- prompt layer presence rate
- omitted layer rate
- token budget per layer
- grounding bundle presence rate
- state layer usage rate

Prompt-layer visibility must exist before any rollout of richer memory behavior.

## Prerequisites
- [Step 0](./step_0_baseline_diagnostics_and_guardrails.md)
- [Step 1](./step_1_canonical_conversation_state.md)

## Completion Criteria
- Typed layer contract is fully documented.
- Layer purposes are explicit and non-overlapping.
- Validation requirements for prompt assembly are defined.
- The active prompt builder consumes typed assembly input instead of the legacy grounded-prompt API.
- Later steps have a stable assembly contract to target.

## What Later Steps Will Rely On From This Step
- Step 4 uses typed assembly inputs for resolved turns.
- Step 5 injects retrieval outputs as grounding bundles.
- Step 5.5 expands the grounding bundle into broader catalog mediation.
- Step 6 introduces populated summaries into this contract.
- Step 7 depends on layer-aware budgeting.
- Step 8 depends on stable prompt-shape assumptions.
