# Step 2: Semantic Assistant Turn Persistence

## Research Before Drafting
Inspect `apps/bot/src/customerConversationRouter.ts`, `convex/conversations.ts`, and any current assistant message persistence paths before revising this step. If provider output structure or persistence constraints are uncertain, verify them first in code and official docs. Use Context7 MCP for up-to-date provider or SDK docs when needed.

## Objective
Persist assistant meaning, not just assistant text, so future reasoning depends on canonical records instead of re-parsing natural-language replies.

## Why This Step Comes Now
Step 1 defines canonical state. This step ensures assistant behavior is persisted in a structured form that can reliably update state, drive summaries, and support later query-rewriting logic. Without this step, later phases would still depend too much on re-reading assistant prose.

This step is intentionally about persistence, not about making semantic records authoritative yet. The current system can keep its existing state-update behavior while semantic records are created in shadow mode for later consumption.

## In Scope
- Definition of semantic assistant records
- Deterministic mapping from existing runtime artifacts to structured meaning
- Capturing ordered lists, shown entities, and action intent
- Capturing what facts were grounded versus inferred
- Defining explicit skip rules for transport-like assistant turns that carry no durable meaning

## Out Of Scope
- Redesigning the structured-output contract itself
- Rolling summary generation
- Retrieval refactor
- Rollout policy
- Making semantic records authoritative for state updates in this step

## Current Problems This Step Addresses
Current message persistence tells the system what text the assistant sent, but not enough about what the assistant meant. Problems include:

- The system cannot reliably reconstruct which list item was “the second one.”
- Assistant replies that implicitly change focus do not leave canonical semantic breadcrumbs.
- Later summary generation would be forced to infer semantics from prose.
- Later structured-output hardening would still lack a canonical persistence target.

Relevant current code:

- `apps/bot/src/customerConversationRouter.ts`
- `convex/conversations.ts`

## Target Behavior After This Step
After this step, each assistant turn has both:

- customer-facing text for transport and audit
- a semantic record describing what the assistant did and what entities it explicitly referenced or presented

This semantic record becomes the canonical bridge between state transitions, memory generation, retrieval behavior, and later output hardening.

The semantic record is machine-oriented. It does not replace assistant text for customer-facing replay, audit, or support review in this step.

## Planned Interfaces And Data Contracts

### `AssistantSemanticRecord`
Purpose: structured meaning of one assistant turn.

Required fields:

- `schemaVersion`
- `companyId`
- `conversationId`
- `assistantMessageId`
- `actionType`
- `normalizedAction`
- `semanticRecordStatus`
- `presentedNumberedList`
- `orderedPresentedEntityIds`
- `displayIndexToEntityIdMap`
- `resolvedStandaloneQueryUsed`
- `responseLanguage`
- `responseMode`
- `groundingSourceMetadata`
- `handoffRationale`
- `clarificationRationale`
- `stateMutationHints`

Field semantics:

- `responseMode`: grounded, inferred, clarified, fallback, handoff
- `semanticRecordStatus`: complete, partial, unavailable, or skipped
- `actionType`: preserved raw assistant control signal from current structured output
- `normalizedAction`: rule-based interpretation of what the turn primarily did
- `presentedNumberedList`: whether the assistant presented a numbered selection list in the customer-facing turn
- `orderedPresentedEntityIds`: exact ordered entity IDs the assistant explicitly presented or named
- `displayIndexToEntityIdMap`: canonical displayed-number mapping such as `1 -> entityA`
- `resolvedStandaloneQueryUsed`: the final retrieval-driving query string actually used for this turn, or an explicit `not_used` status when retrieval did not run
- `groundingSourceMetadata`: broad source groups derived from actual system inputs, including retrieval, state, summary, or combined usage
- `handoffRationale` and `clarificationRationale`: fixed reason codes with optional short rule-based explanatory text
- `stateMutationHints`: high-level machine-usable hints for which existing canonical state fields may be updated later

Persistence rules:

- One semantic record maps to one committed assistant message.
- The record is stored separately from the transport message row and linked by `assistantMessageId`.
- The record is immutable once persisted.
- The record may be partial when certainty is unavailable. It must never invent certainty.
- Semantic record creation must not block the assistant message from being sent.

Introduced in: Step 2  
Consumed by: Steps 4, 6, 8

## Data Flow And Lifecycle
Planned lifecycle:

1. Assistant output is produced.
2. The system gathers existing runtime artifacts already available for the turn, including assistant text, `action.type`, retrieval outcome, canonical state context, response language, and actual retrieval query usage.
3. A deterministic rule-based mapper converts those artifacts into a semantic record without calling the model again.
4. After the assistant message is successfully sent and committed, the semantic record is persisted in its own collection linked to that committed assistant message.
5. Existing state updates may continue to use current logic in this step.
6. Later steps consume semantic records as higher-quality machine inputs than raw prose alone.

Rules:

- Semantic records must be attributable to a single assistant turn.
- Assistant text remains the customer-facing source of truth for audit in this step.
- Semantic records are machine-use artifacts until later steps make parts of them authoritative.
- List ordering must be captured canonically if the assistant presented a selection list.
- Ordered entity capture must include both the ordered IDs and the displayed number-to-ID map.
- Only entities the assistant explicitly showed or named belong in the semantic record. Hidden retrieval candidates do not.
- Skip rules should remain narrow and explicit and should be based on known system turn types rather than text matching.

## Edge Cases And Failure Modes
- Assistant presented a list but transport text was truncated or reformatted
- Assistant action was `clarify` but still implied a partial focus change
- Provider output partially parsed and needs a “semantic record unavailable” state
- Assistant used retrieval plus state and those inputs conflict
- Handoff turn still needs semantic capture even if the customer-facing text is simple
- Assistant turn is fallback or handoff and still needs durable semantic capture
- Assistant turn is transport-like and should be explicitly skipped instead of creating noisy semantic data
- Semantic record creation fails after the assistant message commits and must be logged without blocking delivery

## Validation And Test Scenarios
Minimum scenarios:

- Assistant sends numbered list and persistence captures exact ordered entity IDs.
- Assistant sends numbered list and persistence captures exact display-index-to-entity mapping.
- Assistant clarifies without changing focus.
- Assistant answers from grounded product facts and records grounded mode.
- Assistant answers and asks a follow-up question, and the mode remains `grounded` because the answer is the main result.
- Assistant chooses handoff and records rationale plus side effects.
- Assistant fallback turn persists semantic meaning without pretending grounded facts.
- Assistant turn has insufficient information and persists a partial semantic record with explicit unknown status.
- Assistant output is transport-friendly text but semantic record still captures structured meaning.

Each scenario must define:

- prior state
- assistant output
- runtime artifacts used for mapping
- persisted semantic record
- expected logging outcome if semantic persistence is partial or unavailable

Explicit skip policy:

- Step 2 should define a narrow explicit list of skippable assistant turn types that are purely transport-like and carry no durable meaning.
- Skips must be keyed off known system turn types, not message-text pattern matching.
- If a turn includes durable meaning, it should produce a semantic record even if the customer-facing text is short.

## Rollout And Observability Requirements
Required signals for later implementation:

- semantic record creation success rate
- rate of assistant turns missing semantic metadata
- list-presentation capture rate
- semantic record partial-rate
- semantic record unavailable-rate
- state-update success rate when later driven from semantic records

This step should be introduced in shadow mode before semantic records become authoritative inputs for later phases. Mismatch analysis between assistant text and semantic records belongs to later rollout work rather than this step.

## Prerequisites
- [Step 1](./step_1_canonical_conversation_state.md)

## Completion Criteria
- `AssistantSemanticRecord` is fully defined.
- Canonical deterministic mapping from existing runtime artifacts to semantic record is documented.
- Ordered list and entity mapping capture are explicitly required.
- Partial, unavailable, skipped, and non-blocking persistence behavior are explicitly required.
- Validation scenarios show how semantic persistence supports later reasoning.

## What Later Steps Will Rely On From This Step
- Step 4 uses semantic records to resolve ambiguous follow-ups.
- Step 6 uses semantic records as high-quality inputs for summaries.
- Step 8 depends on a stable semantic persistence target when structured-output handling is hardened.
