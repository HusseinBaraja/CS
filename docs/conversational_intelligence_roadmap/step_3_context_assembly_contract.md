# Step 3: Context Assembly Contract

## Research Before Drafting
Inspect `packages/ai/src/chat/prompt.ts`, `packages/ai/src/chat/promptContracts.ts`, `packages/rag/src/index.ts`, `convex/conversations.ts`, and `apps/bot/src/customerConversationRouter.ts` before revising this step. If assumptions about provider request shape are uncertain, verify them in the chat adapters before turning adapter behavior into roadmap requirements.

## Objective
Define a provider-agnostic, typed context-assembly contract so future work does not collapse summary, state, history, grounding, and current-turn payload into one untyped prompt blob.

## Why This Step Comes Now
State and semantic persistence must exist conceptually before prompt assembly can be formalized. This step creates the stable assembly boundary that later turn resolution, retrieval, summary, and budgeting work will plug into.

## In Scope
- Typed context-layer definitions
- Separation of memory, state, discourse, and grounding responsibilities
- Provider-agnostic prompt-assembly input and output contracts
- Layer ordering, omission rules, and observability requirements

## Out Of Scope
- Query rewriting behavior
- Retrieval implementation details
- Summary generation policy
- Provider-specific prompt optimizations
- Exact token accounting policy

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
After this step, the project has a documented context-assembly contract with distinct responsibilities:

- behavior instructions tell the model how to behave and what output shape to follow
- summary provides optional durable long-range memory
- canonical state provides optional machine-derived current context
- recent turns preserve local discourse selected by history policy
- grounding facts provide prompt-safe factual evidence for the current turn
- current user turn payload carries the present request into the compiled chat request

This contract compiles into one canonical provider-agnostic chat request shape. Provider adapters may transform that shape internally, but the assembly contract itself must not vary by provider.

## Architectural Position
This step defines a boundary between:

- source objects produced by storage, history-selection, retrieval, and future summary systems
- prompt-layer projections derived from those source objects
- final ordered chat messages sent to the chat-provider manager

Step 3 must not require prompt assembly to consume storage DTOs verbatim. Prompt assembly consumes prompt-safe derived projections.

## Planned Interfaces And Data Contracts

### `BehaviorInstructionLayer`
Purpose: stable behavior and output-contract instructions that define assistant behavior independent of a specific provider adapter.

Required fields:

- `targetLanguage`
- `allowedActions`
- `groundingPolicy`
- `safetyPolicy`
- `outputContract`

Introduced in: Step 3  
Consumed by: Steps 4, 5, 8

Notes:

- This layer is required.
- It must compile into the canonical chat request shape without exposing provider-specific formatting rules.

### `ConversationSummaryLayer`
Purpose: optional durable long-range memory layer used in prompt assembly.

Required fields when present:

- `summaryId`
- `conversationId`
- `summaryText`
- `coveredMessageRange`
- `freshness`
- `provenance`

Introduced in: Step 3 as a planned prompt layer  
Implemented behaviorally in: Step 6

Notes:

- This layer is optional until Step 6.
- Its absence is a valid state and must not require fake placeholder content.

### `ConversationStateLayer`
Purpose: optional prompt-safe projection of canonical conversation state.

Required fields when present:

- `conversationId`
- `responseLanguage`
- `currentFocus`
- `lastPresentedList`
- `pendingClarification`
- `latestStandaloneQuery`
- `freshness`
- `sourceMarkers`

Introduced in: Step 3 as a planned prompt layer  
Consumed behaviorally in: Step 4 and later

Notes:

- This layer is optional in Step 3 even when canonical state exists elsewhere in orchestration.
- Step 3 reserves the typed slot for it; later steps decide when it becomes an authoritative assembly input.
- This layer must be a prompt-safe projection, not a direct pass-through of storage DTOs.

### `RecentTurnsLayer`
Purpose: local conversational discourse selected by history policy before prompt assembly.

Required fields:

- `turns`
- `selectionMode`
- `usedQuotedReference`

Introduced in: Step 3  
Produced by: current history-selection flow in `convex/conversations.ts`

Notes:

- `turns` means the already-selected prompt-history slice produced by history policy.
- This layer must not mean “last N persisted messages”.
- The layer must preserve provenance from history selection, including stale-reset and quoted-reference behavior.

### `GroundingBundle`
Purpose: prompt-safe factual evidence injected for catalog-claim grounding.

Required fields:

- `bundleId`
- `retrievalMode`
- `resolvedQuery`
- `entityIds`
- `contextBlocks`
- `language`

Introduced in: Step 3  
Consumed by: Steps 5, 8

Notes:

- This is the model-facing grounded evidence layer.
- It must not include raw retrieval diagnostics, candidate scores, matched embedding text, or fallback reasons unless a later step explicitly decides those are prompt-safe.
- Retrieval observability stays outside prompt assembly.

### `CurrentUserTurnLayer`
Purpose: the current inbound user request packaged for final prompt compilation.

Required fields:

- `customerMessage`
- `responseLanguage`

Introduced in: Step 3  
Consumed by: all later conversational steps

Notes:

- This layer is required.
- It remains distinct from recent turns and from grounding facts.

### `PromptAssemblyInput`
Purpose: canonical typed input to prompt assembly.

Required fields:

- `behaviorInstructions`
- `recentTurns`
- `currentUserTurn`

Optional fields:

- `conversationSummary`
- `conversationState`
- `groundingBundle`

Introduced in: Step 3  
Consumed by: Steps 4, 5, 6, 8

Rules:

- Optional means the layer may be absent without violating the contract.
- Absence must be representable explicitly in assembly metadata.
- Presence of a source object elsewhere in orchestration does not automatically mean the corresponding prompt layer is consumed yet.

### `PromptAssemblyMetadata`
Purpose: layer-level observability for debugging, rollout comparison, and later budgeting work.

Required fields:

- `layerOrder`
- `presentLayers`
- `omittedLayers`
- `truncatedLayers`
- `omissionReasons`
- `historySelectionMode`
- `usedQuotedReference`

Introduced in: Step 3  
Consumed by: Steps 7, 8, 9

Notes:

- Exact per-layer token accounting is deferred to Step 7.
- Step 3 requires structural observability, not exact token measurement.

### `PromptAssemblyOutput`
Purpose: compiled chat request plus layer metadata.

Required fields:

- `request`
- `metadata`

Introduced in: Step 3  
Consumed by: Steps 7, 8, 9

Rules:

- `request` must be a canonical provider-agnostic ordered chat request.
- Adapter-specific translation, such as mapping system content for Gemini, is an implementation detail below this contract.

## Canonical Layer Order
All implementations must preserve this conceptual order:

1. behavior instructions
2. summary
3. canonical state
4. recent turns
5. grounding facts
6. current user turn payload

This order is a contract requirement, not a suggestion. Provider adapters may re-encode the compiled request, but they must not change the conceptual order of the assembled layers.

## Data Flow And Lifecycle
Planned lifecycle:

1. Upstream stages produce or load source objects.
2. Those source objects are projected into prompt-safe layers.
3. Prompt assembly receives typed layer inputs, not ad hoc strings or raw storage DTOs.
4. Layers are compiled in the fixed conceptual order.
5. Assembly records which layers were present, omitted, or truncated.
6. Provider adapters transform the canonical chat request into provider-specific wire formats without changing assembly semantics.

Rules:

- Summary may not be treated as canonical state.
- Canonical state may not be treated as a substitute for recent discourse.
- Grounding facts may not be treated as memory.
- Recent turns may not be treated as the only source of conversational meaning.
- Retrieval diagnostics may not be treated as model-facing grounding by default.
- The final provider request must remain traceable back to typed layer inputs and metadata.

## Omission And Sentinel Rules
Layer omission is first-class.

Rules:

- Missing optional layers should normally be omitted and recorded in metadata.
- The contract must not require a generic empty sentinel for every absent layer.
- A layer compiler may introduce a sentinel only when model behavior materially benefits from it.
- Current grounding behavior, such as `NO_GROUNDED_CONTEXT_AVAILABLE`, is an implementation detail of the present prompt path, not a universal rule for all future layers.

## Edge Cases And Failure Modes
- Summary missing but state present
- State available in orchestration but not yet consumed by assembly
- Retrieval succeeds but no prompt-safe grounding bundle is produced
- Retrieval diagnostics exist but are intentionally excluded from the prompt
- Prompt assembly exceeds budget and low-priority layers must later be truncated
- Quoted stale reference present while recent-turn window is short
- Provider adapter transforms the request shape without preserving conceptual layer order

## Validation And Test Scenarios
Minimum scenarios:

- Prompt assembled with all currently supported layers present
- Prompt assembled with missing summary but intact recent turns and grounding
- Prompt assembled with canonical state available upstream but omitted from prompt consumption in Step 3
- Prompt assembled from a policy-selected quoted-reference history slice
- Prompt assembled with no grounding bundle and metadata recording the omission
- Prompt-layer metadata correctly records omitted or trimmed layers
- Gemini, DeepSeek, and Groq all consume the same canonical assembled request semantics for bot chat
- Arabic and English requests preserve equivalent layer boundaries

Each scenario should verify:

- source inputs
- derived prompt-layer projections
- final layer order
- omitted or truncated layers
- metadata provenance

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
- Fixed conceptual layer order is documented.
- Omission rules and metadata requirements are defined.
- Exact token accounting is explicitly deferred to Step 7.
- Later steps have a stable assembly contract to target.

## What Later Steps Will Rely On From This Step
- Step 4 uses typed assembly inputs and the reserved state layer boundary for resolved turns.
- Step 5 injects retrieval outputs as prompt-safe grounding bundles instead of raw retrieval internals.
- Step 6 introduces populated summaries into an already-defined optional summary layer.
- Step 7 adds layer-aware budgeting and token accounting to this contract.
- Step 8 depends on stable prompt-shape assumptions and clear layer provenance.
