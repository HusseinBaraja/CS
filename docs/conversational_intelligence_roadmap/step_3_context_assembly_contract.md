# Step 3: Context Assembly Contract

## Research Before Drafting
Inspect `packages/ai/src/chat/prompt.ts`, `packages/rag/src/index.ts`, and the conversation-history retrieval flow before revising this step. If provider support for prompt-layering or system-message handling is uncertain, verify with current official docs and use Context7 MCP where relevant.

## Objective
Define the exact prompt-assembly layers so future work does not collapse summary, state, history, and grounding into one untyped prompt blob.

## Why This Step Comes Now
State and semantic persistence must exist conceptually before prompt assembly can be formalized. This step creates the contract that later turn resolution, retrieval, and summary work will plug into.

## In Scope
- Typed prompt-layer definitions
- Separation of memory and grounding responsibilities
- Prompt-assembly input and output contracts
- Validation requirements for prompt-layer correctness

## Out Of Scope
- Query rewriting behavior
- Retrieval implementation details
- Summary generation policy
- Provider-specific prompt optimizations

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
After this step, the project has a documented context-assembly contract with distinct responsibilities:

- behavior instructions tell the model how to behave
- summary gives durable long-range memory
- canonical state gives machine-usable current context
- recent turns preserve local discourse
- grounding facts provide current factual evidence

This contract becomes the foundation for later token-budget policy and structured-output hardening.

## Planned Interfaces And Data Contracts

### `ConversationSummary`
Purpose: durable long-range memory layer used in prompt assembly.

Required fields:

- `summaryId`
- `conversationId`
- `summaryText`
- `coversMessageRange`
- `freshness`
- `provenance`

Introduced in: Step 3 as a planned prompt-layer type  
Implemented behaviorally in: Step 6

### `GroundingBundle`
Purpose: current factual evidence injected for catalog-claim grounding.

Required fields:

- `bundleId`
- `retrievalMode`
- `resolvedQuery`
- `entityIds`
- `contextBlocks`
- `language`
- `retrievalConfidence`

Introduced in: Step 3  
Consumed by: Steps 5, 8

### `PromptAssemblyInput`
Purpose: canonical typed input to the prompt builder.

Required fields:

- `behaviorInstructions`
- `conversationSummary`
- `conversationState`
- `recentTurns`
- `groundingBundle`
- `responseLanguage`
- `allowedActions`

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

Rules:

- Summary may not be treated as canonical state.
- Grounding facts may not be treated as memory.
- Recent turns may not be treated as the only source of conversational meaning.
- The final prompt request must remain traceable back to typed layer inputs.

## Edge Cases And Failure Modes
- Summary missing but state present
- State stale while recent turns remain strong
- Retrieval returns no grounding bundle
- Prompt assembly exceeds budget and must omit low-priority context
- Quoted stale reference present while recent-turn window is short

## Validation And Test Scenarios
Minimum scenarios:

- Prompt assembled with all layers present
- Prompt assembled with missing summary but intact state and grounding
- Prompt assembled with no grounding bundle and targeted clarification expected later
- Prompt-layer metadata correctly records omitted or trimmed layers
- Arabic and English requests produce equivalent layer boundaries

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
- Later steps have a stable assembly contract to target.

## What Later Steps Will Rely On From This Step
- Step 4 uses typed assembly inputs for resolved turns.
- Step 5 injects retrieval outputs as grounding bundles.
- Step 6 introduces populated summaries into this contract.
- Step 7 depends on layer-aware budgeting.
- Step 8 depends on stable prompt-shape assumptions.
