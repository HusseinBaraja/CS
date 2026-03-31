# Step 10: Legacy Simplification and Final Convergence

## Research Before Drafting
Inspect the current legacy paths in retrieval, history trimming, stale-context handling, and fallback selection before revising this step. Verify that all replacement capabilities are fully specified in earlier steps before documenting cleanup. If any replacement path still depends on uncertain provider behavior, verify with official docs and Context7 MCP where relevant.

## Objective
Remove obsolete behavior only after the replacement stack has been proven by rollout evidence.

## Why This Step Comes Now
Cleanup must happen last. Deleting legacy paths earlier would collapse rollback safety and hide whether the new architecture genuinely replaced the old one.

## In Scope
- Explicit list of removable legacy behaviors
- Preconditions for cleanup
- Final convergence rules
- Prevention of hybrid-state dead zones where old and new logic both partially run

## Out Of Scope
- Rollout design
- New feature additions
- Prompt-layer redesign

## Current Problems This Step Addresses
Even after the new stack is implemented, legacy paths can linger and create long-term problems:

- raw-message retrieval continues to bypass resolved intent
- early `empty` and `low_signal` fallbacks remain reachable
- trim-first assumptions continue to destroy recoverable context
- old idle reset semantics conflict with state and summary-based memory

Relevant current code:

- `packages/rag/src/index.ts`
- `convex/conversations.ts`
- `apps/bot/src/customerConversationRouter.ts`

## Target Behavior After This Step
After this step, the conversation system converges on one coherent architecture:

- turn resolution is authoritative before retrieval
- state and summary replace text-only continuity assumptions
- structured-output hardening replaces brittle parse-to-handoff behavior
- retention is summary-backed rather than trim-first

There should no longer be silent fallback into obsolete logic.

## Planned Interfaces And Data Contracts
This step primarily removes old behavior rather than introducing new interfaces, but it must define cleanup preconditions:

- `ReplacementCapabilityChecklist`
- `LegacyPathRemovalGate`

These may remain conceptual, but the cleanup decision boundary must be explicit.

## Data Flow And Lifecycle
Cleanup lifecycle:

1. Confirm rollout evidence from Step 9.
2. Verify replacement capabilities are populated consistently.
3. Disable legacy path behind flag.
4. Observe metrics for regression.
5. Remove legacy implementation only after stability is proven.

## Edge Cases And Failure Modes
- Legacy raw-query path still triggered by a corner case
- State and summary exist but some tenants still depend on old trimming assumptions
- Partial cleanup removes rollback capability too early
- Hybrid operation leaves inconsistent observability or duplicated decisions

## Validation And Test Scenarios
This step owns:

- new stack handles numbered follow-ups without legacy raw retrieval
- no user-visible regression after disabling early final low-signal fallback
- archived-history conversations still work without trim-first assumptions
- rollback can still re-enable safe prior behavior until final deletion

## Rollout And Observability Requirements
Cleanup must not begin until:

- Step 9 thresholds have remained healthy for a defined observation window
- replacement-path usage is high and stable
- legacy-path invocation rate is near zero or fully explainable
- rollback remains available until final deletion

## Prerequisites
- [Step 9](./step_9_incremental_rollout_and_regression_prevention.md)

## Completion Criteria
- Legacy path list is explicit.
- Cleanup preconditions are explicit.
- The step states that no cleanup is allowed before Step 9 evidence is healthy.
- Final convergence rules prevent hybrid architecture from persisting indefinitely.

## What Later Steps Will Rely On From This Step
This is the terminal roadmap step. No later steps depend on it. It defines the end-state architecture and removal gates.
