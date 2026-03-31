# Step 6: Rolling Summary and Memory Hierarchy

## Research Before Drafting
Inspect current history retention logic in `convex/conversations.ts`, prompt assembly in `packages/ai/src/chat/prompt.ts`, and any relevant provider documentation for long-context or summary strategies before revising this step. Use Context7 MCP and official docs for current guidance when provider behavior matters.

## Objective
Add durable long-range memory without bloating prompt size or confusing summary with canonical state.

## Why This Step Comes Now
Summary should not exist before canonical state, semantic assistant records, and a typed context-assembly contract. Otherwise the system would summarize the wrong things or treat summary as a substitute for state.

## In Scope
- Rolling summary purpose and contract
- Summary update policy
- Memory hierarchy definition
- Relationship between summary, state, recent turns, and archive

## Out Of Scope
- Retention enforcement rules
- Structured-output repair
- Rollout mechanics

## Current Problems This Step Addresses
The current system has short-term message history and an aggressive stale-context reset, but it lacks durable long-range memory. Without summary:

- long conversations depend entirely on recent turns
- old history is either dropped or becomes expensive to keep verbatim
- the system cannot preserve durable customer goals or earlier decisions cleanly

Relevant current code:

- `convex/conversations.ts`
- `packages/ai/src/chat/prompt.ts`

## Target Behavior After This Step
After this step, the memory hierarchy is explicit:

- summary stores durable narrative memory
- canonical state stores current machine-usable focus
- recent turns store local conversational discourse
- grounding facts store current external evidence

Summary supports continuity across longer conversations and after trimming or archival, but it never replaces state.

## Planned Interfaces And Data Contracts

### `ConversationSummary`
Purpose: durable narrative memory derived from prior conversation and semantic records.

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

Introduced behaviorally in: Step 6  
Planned as a prompt layer in: Step 3  
Consumed by: Step 7 and prompt assembly

Field rules:

- Must not contain transient reasoning that belongs in canonical state
- Must not contain raw grounding facts that will go stale
- Must be attributable to specific covered history ranges

## Data Flow And Lifecycle
Planned lifecycle:

1. Semantic records and state provide high-quality inputs.
2. Summary is created after enough history accumulates.
3. Summary is refreshed when meaningful durable context changes.
4. Prompt assembly consumes summary as a separate layer.
5. Retention later uses summary checkpoints to allow archival of old turns.

Summary update inputs should include:

- canonical state snapshots
- semantic assistant records
- selected user turns

Summary must never overwrite:

- canonical current focus
- current variant selection
- live retrieval evidence

## Edge Cases And Failure Modes
- Summary drifts from current state
- Summary preserves obsolete product facts
- Summary refresh happens after a topic switch and incorrectly merges unrelated conversations
- Summary becomes too long and loses hierarchy
- Summary exists but recent turns are missing critical local discourse

## Validation And Test Scenarios
This step owns:

- long conversation with durable goal preserved in summary
- summary present while recent turns are short
- topic switch causing summary boundary update
- summary preserving business-relevant decisions without stale catalog facts
- Arabic conversation where summary preserves durable context correctly

Each scenario must define:

- input history range
- semantic/state inputs
- expected summary contents
- fields that must not appear in the summary

## Rollout And Observability Requirements
Required metrics:

- summary creation rate
- summary refresh rate
- summary size distribution
- summary usage rate in prompt assembly
- mismatch rate between summary and canonical state

Summary should be introduced as a supplemental layer before retention depends on it.

## Prerequisites
- [Step 1](./step_1_canonical_conversation_state.md)
- [Step 2](./step_2_semantic_assistant_turn_persistence.md)
- [Step 3](./step_3_context_assembly_contract.md)

## Completion Criteria
- Summary purpose is distinct from state and grounding.
- Summary update rules are documented.
- Covered-range provenance is required.
- Validation scenarios show that summary preserves durable context without taking over state.

## What Later Steps Will Rely On From This Step
- Step 7 relies on summary checkpoints before archival.
- Prompt assembly gains a stable long-range memory layer.
- Step 9 can evaluate whether summary reduces unnecessary clarifications after longer conversations.
