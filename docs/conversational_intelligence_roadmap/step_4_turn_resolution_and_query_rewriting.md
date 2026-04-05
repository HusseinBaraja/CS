# Step 4: Turn Resolution and Retrieval Intent Selection

## Research Before Drafting
Inspect `packages/rag/src/index.ts`, `apps/bot/src/customerConversationRouter.ts`, `convex/conversations.ts`, `packages/shared/src/conversationState.ts`, and the prompt assembly path before revising this step. If current provider behavior for reasoning, structured output, or intent resolution is uncertain, verify it via current official docs and Context7 MCP where appropriate.

## Objective
Resolve each inbound turn into a canonical, pre-retrieval interpretation so the system no longer treats every message as an isolated semantic-search query.

This step is not only about query rewriting. It is the stage that:

- resolves what the user means
- binds referents to prior context when possible
- decides whether clarification is required
- selects the intended retrieval path
- produces a standalone query only when later retrieval actually needs one

## Why This Step Comes Now
This step depends on having canonical state, semantic assistant records, and a typed context-assembly contract. Without those foundations, rewriting would still be forced to infer too much from raw message text.

## In Scope
- Resolution of ambiguous follow-up language
- Retrieval-intent selection
- Standalone query generation when applicable
- Reference extraction from recent turns, state, summary, quotes, and semantic assistant records
- Confidence and clarification decision boundaries
- Structured provenance for why a turn resolved the way it did

## Out Of Scope
- Retrieval implementation changes
- Summary generation policy
- Prompt wording for clarification replies
- Provider-specific structured-output hardening
- Rollout mechanics beyond Step 4-owned observability

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
- `apps/bot/src/customerConversationRouter.ts`
- `convex/conversations.ts`
- `packages/shared/src/conversationState.ts`

## Target Behavior After This Step
After this step, every inbound turn first produces a canonical resolution result that answers:

- what the user is asking for retrieval purposes
- which entities or presented-list positions they are referring to
- whether the request is resolvable without clarification
- what retrieval path should run next
- what standalone query should drive retrieval when semantic search is still the correct next step

Retrieval may no longer run directly on raw inbound text once this step is active, except where Step 4 explicitly marks raw passthrough as an intentional typed fallback.

## Resolution Design Principles
- Turn resolution is a pure stage. It emits a non-persistent result and does not directly mutate canonical state.
- Resolution is deterministic-first. Model assistance is a bounded fallback, not the default path.
- Current-turn retrieval results are forbidden as resolution inputs.
- Multi-tenant scoping is mandatory. Resolution may never bind entities outside the current company.
- Quoted references are a high-priority binding signal, but conflicting current focus must still be retained in provenance.
- Heuristic canonical-state hints are weak support signals only. They are never authoritative inputs.
- Summary is support-only. It may influence continuity and confidence, but it may not independently authorize entity binding.

## Authoritative vs Supporting Sources

### Authoritative Inputs
- explicit quoted reference
- canonical `currentFocus`
- canonical `lastPresentedList`
- active canonical `pendingClarification`
- semantic assistant records tied to a specific relevant assistant turn

### Supporting Inputs
- recent turns
- conversation summary

### Weak Hint Inputs Only
- `heuristicHints.topCandidates`
- `heuristicHints.heuristicFocus`
- `heuristicHints.retrievalOrderListProxy`

These heuristic fields may support confidence or clarification candidate generation, but they may not independently drive high- or medium-confidence entity binding.

## Planned Interfaces And Data Contracts

### `TurnResolutionInput`
Purpose: canonical typed input to the pre-retrieval resolution stage.

Required fields:

- `rawInboundText`
- `recentTurns`
- `canonicalState`
- `conversationSummary`
- `resolutionPolicy`

Optional fields:

- `languageHint`
- `quotedReference`
- `semanticAssistantRecords`

`quotedReference` should contain normalized, resolver-safe data rather than only IDs. When available, it should include:

- message identifiers
- role
- text
- any already-known presented-list structure
- any already-known entity mapping

`semanticAssistantRecords` may be preloaded by the caller or fetched lazily by the resolver after higher-priority sources fail to resolve the turn.

### `ResolutionPolicy`
Purpose: explicit behavioral policy for resolution and rollout modes.

Required fields:

- `allowModelAssistedFallback`
- `allowSemanticAssistantFallback`
- `allowSummarySupport`
- `staleContextWindowMs`
- `quotedReferenceOverridesStaleness`
- `minimumConfidenceToProceed`
- `allowMediumConfidenceProceed`

Optional fields:

- `maxSemanticFallbackDepth`

This object exists so shadow-mode and authoritative-mode behavior can differ without changing the contract.

### `ResolvedUserTurn`
Purpose: canonical non-persistent resolution of the current inbound turn before retrieval.

Required fields:

- `rawInboundText`
- `normalizedInboundText`
- `resolvedIntent`
- `preferredRetrievalMode`
- `queryStatus`
- `standaloneQuery`
- `presentedListTarget`
- `referencedEntities`
- `primaryEntityId`
- `resolutionConfidence`
- `clarificationRequired`
- `clarification`
- `selectedResolutionSource`
- `provenance`
- `language`

#### `resolvedIntent`
This step uses a narrow retrieval-facing enum, not a broad assistant workflow taxonomy.

Allowed values:

- `catalog_search`
- `entity_followup`
- `image_request`
- `clarification_answer`
- `ambiguous_unresolved`
- `non_catalog_or_unsupported`

#### `preferredRetrievalMode`
Allowed values:

- `semantic_catalog_search`
- `direct_entity_lookup`
- `variant_lookup`
- `skip_retrieval`
- `clarification_required`

#### `queryStatus`
Allowed values:

- `rewritten`
- `resolved_passthrough`
- `unresolved_passthrough`
- `not_applicable`

#### `standaloneQuery`
`standaloneQuery` is `string | null`.

Rules:

- `catalog_search`: required non-empty query
- `entity_followup`: query may be present or null
- `image_request`: query may be null
- `clarification_answer`: query may be present or null
- `ambiguous_unresolved`: null
- `non_catalog_or_unsupported`: null

Raw passthrough is allowed only as an explicit typed fallback. If `standaloneQuery` is passed through rather than rewritten, Step 4 must record why.

Required passthrough reasons:

- `already_standalone`
- `no_safe_rewrite_needed`
- `insufficient_context_for_rewrite`
- `entity_resolved_but_query_not_needed`
- `clarification_short_circuit`

#### `presentedListTarget`
Purpose: preserve list-position targeting separately from final entity binding.

This field is required when resolution depends on ordinal or index language such as:

- `first`
- `second`
- `الأول`
- `الثاني`
- `رقم 2`

It should capture:

- source list identity
- list kind
- targeted display indexes

#### `referencedEntities`
This field supports multiple entities.

Each item should include:

- `entityKind`
- `entityId`
- `source`
- optional confidence

`primaryEntityId` is optional and exists for downstream default behavior when one entity is central.

Supported entity kinds:

- `category`
- `product`
- `variant`

Variant-level resolution is first-class in this step. If a variant is resolved, Step 4 should preserve the parent product when available through linked metadata or an additional referenced entity.

#### `resolutionConfidence`
Use a qualitative enum, not a public numeric threshold.

Allowed values:

- `high`
- `medium`
- `low`

Behavioral meaning:

- `high`: may proceed
- `medium`: may proceed only when there is one coherent interpretation, no strong-source conflicts, and the next action is low-risk
- `low`: must clarify

#### `clarification`
Step 4 owns clarification intent shape, not final user-facing wording.

When clarification is required, this field should include:

- `reason`
- `target`
- `suggestedPromptStrategy`
- optional capped `candidateOptions`

Allowed reasons:

- `ambiguous_referent`
- `multiple_candidate_lists`
- `stale_context_without_anchor`
- `unsupported_request`
- `low_confidence_resolution`
- `missing_required_entity`
- `referenced_entity_invalid`

Suggested prompt strategies include:

- `ask_for_name`
- `ask_for_index`
- `ask_to_restate`
- `explain_unsupported_scope`

Clarification candidate options must be capped and curated by Step 4. The cap should remain small, ideally 2 to 3.

#### `selectedResolutionSource`
Allowed values:

- `quoted_reference`
- `current_focus`
- `last_presented_list`
- `semantic_assistant_record`
- `recent_turns`
- `summary`
- `raw_text`

#### `provenance`
`contextSourcesUsed` should be replaced by structured provenance with:

- `selectedSources`
- `supportingSources`
- `conflictingSources`
- `discardedSources`

Provenance should preserve detailed evidence when available, such as:

- transport message ID
- conversation message ID
- semantic assistant record ID
- canonical-state path
- summary ID

This metadata is primarily for evaluation, debugging, and rollout observability. It is not necessarily prompt-facing.

## Canonical Resolution Order
The resolver must apply sources in this order:

1. explicit quoted reference
2. explicit selected entity in canonical state
3. fresh canonical presented list
4. active pending clarification in canonical state
5. semantic assistant record tied to the relevant assistant turn
6. recent-turn discourse
7. summary as long-range support
8. raw text only as the weakest source

If quoted reference conflicts with `currentFocus`, quoted reference wins for binding, but `currentFocus` remains present in provenance as a competing signal.

## Data Flow And Lifecycle
Planned lifecycle:

1. Load recent turns, state, and summary.
2. Resolve the inbound turn against those sources.
3. Produce `ResolvedUserTurn`.
4. If confidence is sufficient, pass the standalone query to retrieval.
5. If confidence is insufficient, emit a targeted clarification requirement instead of broad ambiguity handling.

This stage is pure. It may not write canonical state directly.

1. explicit quoted reference
2. explicit selected entity in state
3. most recent presented list and index mapping
4. recent-turn discourse
5. summary as long-range support
6. raw text only as the weakest source

## Edge Cases And Failure Modes
- User references “the second one” after multiple lists were shown
- User references a deleted product that still exists in summary or stale state
- User says “same as before” but the last two candidate referents conflict
- User follows up after idle gap and only stable state should remain
- Quoted stale reply overrides stale reset only for the quoted branch
- Mixed-language follow-up where Arabic and English terms refer to the same entity
- Multi-entity focus exists but the user uses singular pronouns
- Clarification answer arrives after a missed state write for `pendingClarification`
- Direct entity follow-up needs no query at all
- Safe semantic-search passthrough occurs without rewriting
- Variant-descriptor narrowing must stay inside an already-known product family

## Validation And Test Scenarios
This step owns resolver-specific fixtures in the shape:

- `id`
- `description`
- `input: TurnResolutionInput`
- `expected: ResolvedUserTurn`
- optional expected clarification reason
- optional notes

Minimum required scenarios:

- numbered referent resolution in Arabic
- pronoun-based follow-up in English
- picture request referring to a selected product
- size query referring to a selected variant family
- same-turn ambiguity that still requires clarification
- quoted stale reply overriding current focus
- multi-entity focus with singular pronoun requiring clarification
- invalid or deleted referenced entity
- clarification answer with missing canonical `pendingClarification` but a clear prior assistant clarification prompt
- raw passthrough safe-search case
- direct entity lookup case with `queryStatus = not_applicable`
- category follow-up grounded in explicit prior context
- bounded model-assisted variant narrowing within a known family

Mixed Arabic/English fixtures are best-effort rather than a hard completion gate, but they are strongly encouraged because this system is explicitly bilingual.

## Rollout And Observability Requirements
Later implementation must measure:

- deterministic resolution success rate
- clarification-required rate
- retrieval-mode distribution
- selected/supporting/conflicting source distribution
- raw-passthrough rate by reason
- quoted-reference usage rate
- invalid-referenced-entity rate
- disagreement rate between deterministic and model-assisted resolution in shadow mode
- measured model-assisted uplift on previously unresolved cases
- false-clarification rate
- false-binding rate

Step 4 should begin with:

- deterministic resolver in the live path
- model-assisted fallback in shadow mode only

## Prerequisites
- [Step 1](./step_1_canonical_conversation_state.md)
- [Step 2](./step_2_semantic_assistant_turn_persistence.md)
- [Step 3](./step_3_context_assembly_contract.md)

## Completion Criteria
- `TurnResolutionInput` is fully defined.
- `ResolvedUserTurn` is fully defined.
- Resolution order across context sources is explicit.
- Heuristic canonical-state fields are explicitly non-authoritative.
- Structured provenance replaces flat source usage.
- Retrieval modes and query statuses are explicit.
- Retrieval is formally forbidden from consuming raw inbound text directly unless Step 4 explicitly marks passthrough.
- Current-turn retrieval hits are formally forbidden as resolution inputs.
- Clarification boundaries and typed clarification payloads are explicit.
- Validation cases cover numbered references, pronouns, stale quoted replies, invalid entities, and no-query-needed behavior.
- Tenant-scoped entity validation is explicit.

## What Later Steps Will Rely On From This Step
- Step 5 consumes `ResolvedUserTurn` and `preferredRetrievalMode`.
- Step 5 uses `standaloneQuery` only when Step 4 marks it applicable.
- Step 8 uses clarification reasons, confidence boundaries, and provenance.
- Step 9 uses resolution and shadow-comparison metrics for rollout.
