# Step 9: Incremental Rollout and Regression Prevention

## Research Before Drafting
Inspect the current runtime configuration, logging, and any rollout-related controls before revising this step. If provider telemetry, flagging patterns, or rollout practices are uncertain, verify with current docs and Context7 MCP where relevant.

## Objective
Define how the new conversation stack is introduced safely, measured rigorously, and rolled back quickly if regressions appear.

## Why This Step Comes Now
User-visible rollout must happen only after retrieval, memory, and structured-output changes are defined. This step turns the earlier architecture work into a controlled deployment plan.

## In Scope
- Feature-flag boundaries by step
- Shadow mode and canary strategy
- Regression evaluation ownership
- Acceptance thresholds
- Rollback triggers

## Out Of Scope
- Legacy cleanup itself
- New retrieval modes
- Summary generation details

## Current Problems This Step Addresses
Without a rollout plan, the new stack could ship all at once and make failures difficult to diagnose. The existing system already has multiple fallback paths, which means replacement behavior must be measured carefully rather than assumed to be better.

Relevant current code to inspect:

- `packages/config/src/index.ts`
- `apps/bot/src/runtimeConfig.ts`
- logging and analytics entrypoints

## Target Behavior After This Step
After this step, every behavior-changing layer can be introduced incrementally:

- shadow mode for non-authoritative comparison
- canary rollout for limited live traffic
- explicit acceptance thresholds before expansion
- rollback triggers tied to measured regressions

## Planned Interfaces And Data Contracts
This step reuses prior contracts rather than introducing a major new domain model, but it must define rollout-facing envelopes such as:

- `RolloutGate`
- `RegressionThreshold`
- `ShadowComparisonRecord`

These may remain conceptual if implementation later centralizes them elsewhere, but the rollout semantics must be explicit.

## Data Flow And Lifecycle
Planned rollout lifecycle:

1. Shadow mode records new-pipeline outputs without changing customer behavior.
2. Baseline and new-pipeline results are compared against the evaluation set.
3. Canary rollout enables user-visible behavior for a limited traffic slice.
4. Metrics are reviewed against acceptance thresholds.
5. Rollout expands only if all required thresholds remain healthy.

## Edge Cases And Failure Modes
- Shadow mode shows improvement on referent resolution but higher parse-failure rate
- Canary rollout improves contextual success but increases handoff rate
- Arabic quality improves while English regresses
- Low-volume tenants hide regressions that appear only at scale
- Prompt size and cost rise faster than latency budgets allow

## Validation And Test Scenarios
This step owns rollout-level validation:

- resolved-query retrieval outperforms raw-query retrieval on the baseline set
- clarification rate falls for resolvable follow-ups
- parse failures remain below threshold under canary traffic
- cost and latency remain inside defined guardrails
- handoff rate does not spike after enabling structured-output hardening

Each rollout scenario must define:

- traffic slice
- compared pipeline variants
- target metrics
- rollback thresholds

## Rollout And Observability Requirements
Required tracked metrics:

- contextual follow-up success rate
- unnecessary clarification rate
- low-signal recovery rate
- parse failure rate
- handoff rate
- prompt size by layer
- latency and cost by phase

Required rollout controls:

- feature flags scoped by step
- shadow mode enablement
- canary tenant or traffic allowlist
- explicit rollback conditions

## Prerequisites
- [Step 0](./step_0_baseline_diagnostics_and_guardrails.md)
- [Step 5](./step_5_retrieval_refactor.md)
- [Step 8](./step_8_structured_output_hardening.md)

## Completion Criteria
- Rollout phases are explicit.
- Acceptance thresholds are documented.
- Rollback triggers are defined.
- Shadow mode and canary strategy are included.
- Metrics cover conversational quality, stability, cost, and latency.

## What Later Steps Will Rely On From This Step
- Step 10 relies on this step’s evidence before removing legacy paths.
