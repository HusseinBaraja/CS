# Step 2: Semantic Assistant Turn Persistence

## Research Before Drafting
Inspect `apps/bot/src/customerConversationRouter.ts`, `convex/conversations.ts`, and any current assistant message persistence paths before revising this step. If provider output structure or persistence constraints are uncertain, verify them first in code and official docs. Use Context7 MCP for up-to-date provider or SDK docs when needed.

## Objective
Persist assistant meaning, not just assistant text, so future reasoning depends on canonical records instead of re-parsing natural-language replies.

## Why This Step Comes Now
Step 1 defines canonical state. This step ensures assistant behavior is persisted in a structured form that can reliably update state, drive summaries, and support later query-rewriting logic. Without this step, later phases would still depend too much on re-reading assistant prose.

## In Scope
- Definition of semantic assistant records
- Mapping assistant outputs to structured meaning
- Capturing ordered lists, shown entities, and action intent
- Capturing what facts were grounded versus inferred

## Out Of Scope
- Redesigning the structured-output contract itself
- Rolling summary generation
- Retrieval refactor
- Rollout policy

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
- a semantic record describing what the assistant did and what entities it referenced

This semantic record becomes the canonical bridge between state transitions, memory generation, retrieval behavior, and later output hardening.

## Planned Interfaces And Data Contracts

### `AssistantSemanticRecord`
Purpose: structured meaning of one assistant turn.

Required fields:

- `conversationId`
- `assistantMessageId`
- `actionType`
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
- `groundingSourceMetadata`: whether the turn used retrieved facts, state-only reasoning, summary-only reasoning, or combined context
- `stateMutationHints`: machine-usable hints for which state fields should be updated after the turn

Introduced in: Step 2  
Consumed by: Steps 4, 6, 8

## Data Flow And Lifecycle
Planned lifecycle:

1. Assistant output is produced.
2. The system converts that output into a semantic record.
3. The semantic record is persisted alongside the customer-facing message.
4. State updates consume the semantic record instead of parsing assistant text.
5. Later summary generation reads semantic records as higher-quality input than raw text alone.

Rules:

- Semantic records must be attributable to a single assistant turn.
- Assistant text is not an authoritative source once semantic persistence exists.
- List ordering must be captured canonically if the assistant presented a selection list.

## Edge Cases And Failure Modes
- Assistant presented a list but transport text was truncated or reformatted
- Assistant action was `clarify` but still implied a partial focus change
- Provider output partially parsed and needs a “semantic record unavailable” state
- Assistant used retrieval plus state and those inputs conflict
- Handoff turn still needs semantic capture even if the customer-facing text is simple

## Validation And Test Scenarios
Minimum scenarios:

- Assistant sends numbered list and persistence captures exact ordered entity IDs.
- Assistant clarifies without changing focus.
- Assistant answers from grounded product facts and records grounded mode.
- Assistant chooses handoff and records rationale plus side effects.
- Assistant output is transport-friendly text but semantic record still captures structured meaning.

Each scenario must define:

- prior state
- assistant output
- persisted semantic record
- expected resulting state transition

## Rollout And Observability Requirements
Required signals for later implementation:

- semantic record creation success rate
- rate of assistant turns missing semantic metadata
- list-presentation capture rate
- mismatch rate between assistant text and semantic record
- state-update success rate when driven from semantic records

This step may be introduced in shadow mode before semantic records become authoritative inputs for later phases.

## Prerequisites
- [Step 1](./step_1_canonical_conversation_state.md)

## Completion Criteria
- `AssistantSemanticRecord` is fully defined.
- Canonical mapping from assistant turn to semantic record is documented.
- Ordered list and entity mapping capture are explicitly required.
- Validation scenarios show how semantic persistence supports later reasoning.

## What Later Steps Will Rely On From This Step
- Step 4 uses semantic records to resolve ambiguous follow-ups.
- Step 6 uses semantic records as high-quality inputs for summaries.
- Step 8 depends on a stable semantic persistence target when structured-output handling is hardened.
