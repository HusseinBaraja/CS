# Step 1: Canonical Conversation State

## Research Before Drafting
Inspect `convex/conversations.ts`, `apps/bot/src/conversationStore.ts`, and `apps/bot/src/customerConversationRouter.ts` before revising this step. If assumptions about persistence models, message visibility, or stale-context behavior are uncertain, verify them in code first. Use Context7 MCP and official docs when any persistence, provider, or architectural assumptions depend on current external behavior.

## Objective
Introduce a machine-usable source of truth for current conversation context so the system no longer depends on raw chat text alone.

## Why This Step Comes Now
The current system stores message history and uses recent turns, but it does not persist canonical state for selections, referents, or focus. Later steps such as query rewriting and summary generation require a stable state model instead of repeatedly inferring meaning from free-form text.

## In Scope
- Definition of canonical conversation state
- Ownership boundaries between state and raw message history
- Freshness and invalidation rules
- Rules for state reads and writes within future conversation stages

## Out Of Scope
- Query rewriting logic itself
- Retrieval refactor
- Rolling summary generation
- Structured-output hardening

## Current Problems This Step Addresses
Current issues that motivate this step:

- The active meaning of “the second one” is not stored as canonical state.
- The system relies on history slices and quoted-message heuristics instead of explicit focus records.
- Idle resets can clear too much context because the system lacks a distinction between stable state and transient context.
- Assistant turns may imply state changes, but those implications are not preserved as first-class records.

Current code to inspect:

- `convex/conversations.ts`
- `apps/bot/src/conversationStore.ts`

## Target Behavior After This Step
After this step, the conversation layer has an authoritative state object that answers:

- What entity is currently in focus?
- What list did the assistant last present?
- Which displayed index maps to which entity?
- Which language should the assistant default to?
- Is clarification currently pending?
- What was the latest resolved standalone query?

Raw messages remain audit history and conversational evidence, but state becomes the primary machine-usable source for later reasoning.

## Planned Interfaces And Data Contracts

### `ConversationState`
Purpose: authoritative machine-usable record of current conversational context.

Required fields:

- `conversationId`
- `companyId`
- `responseLanguage`
- `currentFocusType`
- `currentFocusEntityIds`
- `lastPresentedListType`
- `lastPresentedListItems`
- `displayIndexToEntityIdMap`
- `pendingClarification`
- `latestResolvedStandaloneQuery`
- `stateFreshness`
- `inferenceConfidence`
- `sourceOfTruthMarkers`

Field semantics:

- `currentFocusType`: category, product, variant, catalog-slice, none
- `currentFocusEntityIds`: one or more current focus entities
- `lastPresentedListItems`: ordered list of the entities most recently shown to the user
- `pendingClarification`: whether the system still needs specific disambiguation before safe action
- `stateFreshness`: enough metadata to reason about idle gaps and stale focus
- `sourceOfTruthMarkers`: whether a field came from explicit user choice, assistant presentation, rewrite inference, or quote reference

Introduced in: Step 1  
Consumed by: Steps 2, 4, 5, 6, 7

## Data Flow And Lifecycle
Planned lifecycle:

1. Load state before interpreting the inbound turn.
2. Use current state as an input to later resolution logic.
3. Update state only after a turn completes and the system knows what meaning was actually conveyed.
4. Keep state updates explicit rather than implicit side effects hidden in assistant text.
5. Separate transient freshness rules from durable focus and selection rules.

Rules:

- Later steps may read state before retrieval.
- State must not be reconstructed lazily from historical text on every request once this step is implemented.
- State writes must be attributable to a specific turn and source.

## Edge Cases And Failure Modes
- Long idle gap where stable selection should remain available but transient assumptions should decay
- Quoted reply overriding the current focus
- Conflicting evidence between quoted reference and current inferred state
- Product or variant deleted after it was selected
- User switches topic abruptly and state must be invalidated safely
- Multi-entity mentions where focus must support more than one active referent

## Validation And Test Scenarios
This step must define state-oriented scenarios:

- User chooses item #2 from a list and state records the entity mapping.
- User returns after an idle gap and stable focus remains available while transient assumptions expire.
- Quoted stale message overrides the default focus.
- Product deletion invalidates stale state without crashing later steps.
- Mixed Arabic and English turns retain a correct response-language default.

Each scenario must define:

- prior state
- recent turns
- inbound input
- expected next state
- fields that should remain unchanged

## Rollout And Observability Requirements
Metrics and logs that later implementation must provide:

- state load success rate
- state update success rate
- state invalidation count
- focus source distribution
- mismatch count between text-derived fallback logic and canonical state

State rollout must be shadow-safe first. It should be observable before it becomes authoritative in later steps.

## Prerequisites
- [Step 0](./step_0_baseline_diagnostics_and_guardrails.md)

## Completion Criteria
- `ConversationState` is fully documented with required fields and semantics.
- Freshness, invalidation, and override rules are documented.
- The step explicitly defines that state becomes the primary machine-usable context source.
- Test scenarios cover idle gaps, quotes, and conflicting signals.

## What Later Steps Will Rely On From This Step
- Step 2 uses state concepts to persist assistant semantics.
- Step 4 uses canonical state for referent resolution.
- Step 6 distinguishes summary from state.
- Step 7 depends on state to avoid destructive loss of conversational continuity.
