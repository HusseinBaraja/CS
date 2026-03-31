# Step 8: Structured Output Hardening

## Research Before Drafting
Inspect the current structured-output handling path in `packages/rag/src/index.ts`, `packages/ai/src/chat/prompt.ts`, and parsing code in the AI package before revising this step. Verify provider-side structured-output capabilities and current constraints with official docs and Context7 MCP where relevant.

## Objective
Keep orchestration resilient as prompt complexity grows by hardening structured-output handling and fallback decisions.

## Why This Step Comes Now
This step depends on semantic assistant persistence, typed prompt assembly, and retrieval refactor. Once richer memory and retrieval layers exist, malformed output becomes more expensive and more disruptive. Hardening must happen before broad rollout.

## In Scope
- Fallback decision contract
- Structured-output failure classification
- Repair and retry policy
- Clarification versus handoff decision boundary
- Separation of customer-facing text from orchestration metadata

## Out Of Scope
- Provider selection strategy
- Summary generation
- Retention logic
- Legacy cleanup

## Current Problems This Step Addresses
Current structured-output handling is simple and useful, but it is brittle:

- malformed JSON can jump quickly to handoff
- richer context layers will increase the chance of formatting failures
- fallback selection is tightly coupled to parse success rather than overall recoverability

Relevant current code:

- `packages/rag/src/index.ts`
- `packages/ai/src/chat/prompt.ts`
- `packages/ai/src/chat/output.ts`

## Target Behavior After This Step
After this step:

- structured-output failures are classified and observable
- repair or retry can happen when safe
- clarification is preferred over handoff when the issue is recoverable
- customer-facing text remains separate from orchestration metadata

The system becomes tolerant of richer prompts without losing control flow.

## Planned Interfaces And Data Contracts

### `FallbackDecision`
Purpose: canonical decision record for clarification, fallback, retry, or handoff.

Required fields:

- `decisionType`
- `reason`
- `precedingFailureKind`
- `repairAttempted`
- `retryAttempted`
- `clarificationPossible`
- `handoffJustified`

Introduced in: Step 8  
Consumed by: Step 9 and final steady-state orchestration

## Data Flow And Lifecycle
Planned lifecycle:

1. Provider returns candidate output.
2. Parser validates structure.
3. Failure classification determines whether repair is possible.
4. Repair or retry occurs when safe.
5. If still unresolved, fallback decision logic decides between clarification and handoff.
6. Semantic assistant persistence captures the final meaning.

Rules:

- Parsing failure alone must not imply handoff.
- Handoff requires a stronger justification threshold than “output was malformed.”
- Customer-facing text and orchestration metadata must not be conflated.

## Edge Cases And Failure Modes
- Valid JSON with semantically invalid action choice
- Partial parse success but missing entity references
- Repair succeeds syntactically but still fails semantic validation
- Provider repeatedly returns malformed outputs under rich prompt conditions
- Clarification would be safe but handoff was chosen too early

## Validation And Test Scenarios
This step owns:

- malformed structured output with successful repair
- malformed structured output with retry then clarification
- provider failure versus parse failure producing different fallback decisions
- output that is syntactically valid but semantically inconsistent
- handoff only after contextual recovery and repair are exhausted

Each scenario must define:

- provider output
- parse outcome
- repair path
- expected fallback decision
- expected persisted semantic result

## Rollout And Observability Requirements
Required metrics:

- parse failure rate
- repair success rate
- retry success rate
- clarification after parse failure
- handoff after parse failure

This step must be hardened before major rollout of richer prompt layers.

## Prerequisites
- [Step 2](./step_2_semantic_assistant_turn_persistence.md)
- [Step 3](./step_3_context_assembly_contract.md)
- [Step 5](./step_5_retrieval_refactor.md)

## Completion Criteria
- `FallbackDecision` is fully defined.
- Repair versus retry versus clarification versus handoff boundaries are explicit.
- The step states that parse failure alone is insufficient reason for handoff.
- Validation covers syntactic and semantic failure classes.

## What Later Steps Will Rely On From This Step
- Step 9 uses structured-output stability as a rollout gate.
- Step 10 relies on this hardening before removing legacy fallback paths.
