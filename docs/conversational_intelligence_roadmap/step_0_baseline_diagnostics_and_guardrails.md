# Step 0: Baseline Diagnostics and Guardrails

## Research Before Drafting
Before revising this step, inspect the current code paths first, especially `apps/bot/src/customerConversationRouter.ts`, `packages/rag/src/index.ts`, `packages/ai/src/chat/manager.ts`, and `convex/conversations.ts`. If any technical behavior or provider capability is uncertain, look it up before documenting it. Prefer Context7 MCP for current library and provider docs when relevant, and prefer official docs and primary sources for unstable technical behavior.

## Objective
Define the measurement and guardrail layer required before changing user-visible conversation behavior.

## Why This Step Comes Now
The current bot already contains multiple fallback paths, retrieval outcomes, and persistence flows. Without a baseline and instrumentation, later changes cannot be compared safely against current behavior. Every later phase depends on having trustworthy diagnostics, regression cases, and rollback signals.

## In Scope
- Baseline conversation-quality evaluation cases
- Logging and metric requirements for current and future flows
- Standard event taxonomy that later steps reuse
- Guardrails for “no user-visible behavior change” rollout
- Acceptance criteria for observability completeness

## Out Of Scope
- Rewriting retrieval behavior
- Adding new memory models
- Prompt changes that alter customer behavior
- New persistence records beyond those needed for observability planning

## Current Problems This Step Addresses
Current behavior is difficult to measure precisely because:

- Retrieval outcomes are logged, but not yet framed as part of a broader contextual-reasoning evaluation system.
- The system can fail for different reasons that look similar to end users: low-signal retrieval, early fallback, parse failure, provider failure, or context loss.
- There is no durable evaluation set that tracks known bad examples like numbered follow-ups or pronoun-based requests.
- Later roadmap steps will change the interpretation pipeline, which means before/after comparison must be designed up front.

Relevant current code to inspect:

- `packages/rag/src/index.ts`
- `apps/bot/src/customerConversationRouter.ts`
- `packages/ai/src/chat/manager.ts`

## Target Behavior After This Step
After this step, the project has a shared baseline for how conversational quality is measured and how failures are categorized. Implementers can change internals in later steps without losing the ability to answer:

- What changed?
- Which failure modes improved?
- Which regressions appeared?
- Whether rollout should continue or revert

This step does not change customer-facing behavior. It only defines the instrumentation and evaluation envelope around later work.

## Planned Interfaces And Data Contracts

### `ConversationEvaluationCase`
Purpose: canonical regression case definition for conversational-quality testing.

Required fields:

- `id`
- `title`
- `language`
- `conversationHistory`
- `inboundMessage`
- `expectedResolvedIntent`
- `expectedRetrievalBehavior`
- `expectedAssistantBehavior`
- `tags`

Introduced in: Step 0  
Consumed by: Steps 4, 5, 8, 9

### `ContextUsageEvent`
Purpose: record which context sources influenced a decision.

Required fields:

- `conversationId`
- `requestId`
- `usedRecentTurns`
- `usedConversationState`
- `usedSummary`
- `usedQuotedReference`
- `usedGroundingFacts`
- `stage`

Introduced in: Step 0  
Consumed by: Steps 4, 5, 6, 9

### `RetrievalOutcomeEvent`
Purpose: normalize retrieval diagnostics across old and new pipelines.

Required fields:

- `conversationId`
- `requestId`
- `queryText`
- `retrievalMode`
- `outcome`
- `candidateCount`
- `topScore`
- `contextBlockCount`
- `fallbackChosen`

Introduced in: Step 0  
Consumed by: Steps 5, 9

### `FallbackDecisionEvent`
Purpose: capture why the system clarified, fell back, or handed off.

Required fields:

- `conversationId`
- `requestId`
- `decisionType`
- `reason`
- `precedingStage`
- `resolutionConfidence`
- `retrievalOutcome`
- `providerOutcome`

Introduced in: Step 0  
Consumed by: Steps 5, 8, 9

### `StructuredOutputFailureEvent`
Purpose: normalize malformed-output diagnostics.

Required fields:

- `conversationId`
- `requestId`
- `provider`
- `model`
- `failureKind`
- `repairAttempted`
- `fallbackChosen`

Introduced in: Step 0  
Consumed by: Steps 8, 9

## Data Flow And Lifecycle
The diagnostic layer should conceptually wrap the existing request lifecycle:

1. Inbound request accepted.
2. Retrieval attempt recorded.
3. Context sources recorded.
4. Provider call result recorded.
5. Structured-output parsing result recorded.
6. Fallback or final decision recorded.
7. Evaluation-case matching recorded where applicable.

This lifecycle should be defined once here so later steps extend it instead of inventing separate telemetry schemes.

## Edge Cases And Failure Modes
- Duplicate inbound messages must not inflate evaluation metrics.
- Pending or failed assistant messages must not be counted as successful assistant behavior.
- Muted or handoff states must be distinguishable from AI failure.
- Media-only turns must be observable without distorting text-based conversational metrics.
- Provider failure and parsing failure must remain separately visible even if both lead to the same customer-facing fallback.

## Validation And Test Scenarios
This step owns the baseline catalog of cases that later steps will use. Minimum cases:

- `numbered_followup_ar`: user asks for list, then says `الثاني`
- `pronoun_followup_en`: user asks about a product, then says `what sizes does it come in`
- `idle_gap_then_reference`: user returns after long idle gap with a follow-up that depends on retained state
- `low_signal_raw_query_but_contextual_target_exists`
- `invalid_model_output_vs_provider_failure`

Each case must define:

- Initial conversation context
- Input turn
- Expected current-system behavior
- Expected future-system behavior
- Regression tags

## Rollout And Observability Requirements
This step defines the minimum metrics required before any behavior-changing step is merged:

- retrieval outcome distribution
- clarification rate
- handoff rate
- parse-failure rate
- provider-failure rate
- context-source usage distribution
- conversation-case pass rate for the baseline evaluation set

No behavior-changing rollout may begin until all required event types are populated consistently.

## Prerequisites
None.

## Completion Criteria
- Baseline evaluation cases are documented.
- Event taxonomy is defined once and referenced by later steps.
- “No user-visible behavior change” is explicitly documented.
- Required metrics for later rollout decisions are defined.
- Known current failure classes are mapped to observable events.

## What Later Steps Will Rely On From This Step
- Step 4 uses the evaluation set to validate contextual resolution.
- Step 5 uses retrieval-outcome normalization.
- Step 8 uses structured-output failure taxonomy.
- Step 9 uses all baseline metrics and case definitions to decide rollout readiness.
