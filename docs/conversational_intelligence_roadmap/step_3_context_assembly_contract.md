# Step 3: Context Assembly Contract

## Research Before Drafting
Inspect `packages/ai/src/chat/prompt.ts`, `packages/ai/src/chat/promptContracts.ts`, `packages/rag/src/index.ts`, `convex/conversations.ts`, and `apps/bot/src/customerConversationRouter.ts` before revising this step. If assumptions about provider request shape are uncertain, verify them in the chat adapters before turning adapter behavior into roadmap requirements.

## Objective
Define and implement a provider-agnostic, typed context-assembly contract so future work does not collapse summary, state, history, grounding, and the current user turn into one untyped prompt blob.

## Why This Step Comes Now
State and semantic persistence must exist conceptually before prompt assembly can be formalized. This step creates the stable assembly boundary that later turn resolution, retrieval, summary, and budgeting work will plug into, and it replaces the older grounded-prompt API with a typed assembly contract.

## In Scope
- Typed prompt-layer definitions
- Separation of memory, state, discourse, and grounding responsibilities
- Provider-agnostic prompt-assembly input and output contracts
- Layer metadata and omission tracking
- Immediate migration of the active prompt builder to the new contract

## Out Of Scope
- Query rewriting behavior
- Retrieval implementation details beyond the assembly boundary
- Summary generation policy
- Provider-specific prompt optimizations
- Real token-budget enforcement

## Current Problems This Step Addresses
The current prompt path is narrower than the future architecture:

- Prompt assembly is effectively `system instructions + optional recent turns + final user grounding block`.
- Canonical conversation state is loaded before orchestration, but it is not yet consumed by prompt assembly.
- Retrieval returns richer diagnostics and candidates, but only grounding blocks are model-facing.
- History is already policy-selected before orchestration, but the assembly contract does not say that explicitly.
- Future contributors could merge all context into one string blob, making later evaluation, rollout, and budgeting harder.

Relevant current code:

- `packages/ai/src/chat/prompt.ts`
- `packages/ai/src/chat/promptContracts.ts`
- `packages/rag/src/index.ts`
- `convex/conversations.ts`
- `apps/bot/src/customerConversationRouter.ts`

## Target Behavior After This Step
After this step, the project has a typed context-assembly contract with distinct responsibilities:

- behavior instructions tell the model how to behave and what output shape to follow
- summary provides optional durable long-range memory
- canonical state provides optional machine-derived current context
- recent turns preserve local discourse selected by history policy
- grounding facts provide prompt-safe factual evidence for the current turn
- current user turn remains the final user-owned input

This contract compiles into one canonical provider-agnostic chat request shape. Provider adapters may transform that shape internally, but the assembly contract itself must not vary by provider.

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

Notes:

- This layer is required.
- It must compile into the canonical chat request shape without exposing provider-specific formatting rules.

### `PromptAssemblyInput`
Purpose: canonical typed input to prompt assembly.

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
Purpose: compiled chat request plus layer metadata.

Required fields:

- `messages`
- `layerMetadata`
- `tokenBudgetByLayer`
- `omittedContext`

Introduced in: Step 3  
Consumed by: Steps 7, 8, 9

## Canonical Layer Order
All implementations must preserve this conceptual order:

1. behavior instructions
2. conversation summary
3. canonical conversation state
4. recent turns
5. grounding facts
6. current user turn

This order is a contract requirement, not a suggestion. Provider adapters may re-encode the compiled request, but they must not change the conceptual order of the assembled layers.

## Data Flow And Lifecycle
Planned lifecycle:

1. Upstream stages produce or load source objects.
2. Those source objects are projected into prompt-safe layers.
3. Prompt assembly receives typed layer inputs, not ad hoc strings or raw storage DTOs.
4. Layers are compiled in the fixed conceptual order.
5. Assembly records which layers were present, omitted, or truncated.
6. Provider adapters transform the canonical chat request into provider-specific wire formats without changing assembly semantics.

Concrete message order:

1. system message for behavior instructions
2. system message for summary when present
3. system message for canonical state when present
4. prior user and assistant turns from `recentTurns`
5. final user message containing the grounding bundle block followed by the current user turn block

Rules:

- Summary may not be treated as canonical state.
- Canonical state may not be treated as a substitute for recent discourse.
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
- Provider adapter transforms the request shape without preserving conceptual layer order

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
- truncated layer rate
- prompt-history selection mode distribution
- quoted-reference usage rate
- grounding bundle presence rate
- state-layer availability rate
- state-layer usage rate once later steps activate it

Prompt-layer visibility must exist before richer memory behavior or token-budget policy becomes authoritative.

## Prerequisites
- [Step 0](./step_0_baseline_diagnostics_and_guardrails.md)
- [Step 1](./step_1_canonical_conversation_state.md)

## Completion Criteria
- Typed layer contract is fully documented.
- Provider-agnostic chat-request compilation boundary is explicit.
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
