# Step 7: Retention, Archival, and Token-Budget Policy

## Research Before Drafting
Inspect current trim behavior in `convex/conversations.ts`, current prompt assembly, and any relevant provider guidance on token budgeting or caching before revising this step. Verify unstable provider-specific claims with official docs and Context7 MCP when relevant.

## Objective
Replace message-count trimming with deliberate memory management that preserves conversational continuity while controlling cost and latency.

## Why This Step Comes Now
Retention policy depends on having summary and a memory hierarchy. Without Step 6, trimming still destroys information. This step defines how recent turns, summaries, and archive interact safely.

## In Scope
- Retention policy contract
- Token budget by prompt layer
- Summary-before-trim rule
- Archival thresholds
- Low-value message handling

## Out Of Scope
- Retrieval behavior
- Structured-output repair
- Final rollout policy

## Current Problems This Step Addresses
Current behavior trims messages destructively based on message count. Problems include:

- deletion before summary checkpointing
- no explicit token budget by layer
- no archive policy for historical raw turns
- low-value media placeholders compete with useful conversational context

Relevant current code:

- `convex/conversations.ts`
- `apps/bot/src/customerConversationRouter.ts`

## Target Behavior After This Step
After this step, memory retention is explicit and layered:

- recent turns kept verbatim for local discourse
- older durable content represented in summaries
- raw history archived instead of blindly discarded
- prompt budgets allocated by context layer rather than flat message count

## Planned Interfaces And Data Contracts

### `ConversationMemoryRetentionPolicy`
Purpose: define how memory layers are retained, summarized, archived, and budgeted.

Required fields:

- `recentTurnWindow`
- `tokenBudgetByLayer`
- `summaryCheckpointThreshold`
- `archiveThreshold`
- `destructiveTrimAllowed`
- `lowValueMessageHandling`
- `staleReferenceRecoveryPolicy`

Introduced in: Step 7  
Consumed by: Step 10 and final prompt assembly behavior

Field rules:

- `destructiveTrimAllowed` must remain false until summary checkpointing is complete
- `tokenBudgetByLayer` must separately budget summary, state, recent turns, and grounding facts

## Data Flow And Lifecycle
Planned lifecycle:

1. New turns arrive and are persisted.
2. Summary checkpointing occurs when thresholds are met.
3. Archive boundaries are recorded.
4. Prompt assembly includes recent turns plus summary plus state within explicit budgets.
5. Only then may low-priority raw history be trimmed or archived.

## Edge Cases And Failure Modes
- Summary not ready but archive threshold reached
- Long media-heavy conversation where low-value placeholders dominate the recent-turn window
- Quoted reference targets archived history
- Token budget pressure causes grounding facts to crowd out conversation state
- Arabic and English turns differ significantly in token footprint

## Validation And Test Scenarios
This step owns:

- conversation exceeds recent-turn window but summary preserves continuity
- quoted stale reference remains recoverable after archival
- media-heavy conversation does not evict useful product-selection context
- token budgeting preserves state and grounding while trimming low-value history

Each scenario must define:

- conversation history shape
- summary checkpoint status
- archival status
- expected prompt-layer contents after policy application

## Rollout And Observability Requirements
Required metrics:

- average prompt tokens by layer
- archive rate
- destructive trim rate
- low-value-message suppression rate
- stale-reference recovery success rate

This step should not enable destructive cleanup until summary checkpointing and archive recovery prove reliable.

## Prerequisites
- [Step 6](./step_6_rolling_summary_and_memory_hierarchy.md)

## Completion Criteria
- Retention policy contract is fully defined.
- Summary-before-trim rule is explicit.
- Token budgets are defined by layer.
- Validation scenarios cover stale references and low-value media handling.

## What Later Steps Will Rely On From This Step
- Step 10 relies on this policy to replace legacy trim-first behavior.
- Final prompt assembly uses this step’s budget rules.
