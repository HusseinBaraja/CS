# Conversational Intelligence Roadmap

## Purpose
This roadmap defines a safety-first rebuild of conversational intelligence for the WhatsApp bot. It is written for implementers and agents who need a decision-complete sequence for improving context handling, memory, retrieval order, structured outputs, and rollout safety.

This roadmap intentionally does not depend on `docs/project_roadmap/`. It is a standalone implementation plan for the conversation stack only.

## Authoring Workflow
Before drafting or revising any roadmap step:

1. Inspect the current code paths first so the roadmap reflects real repo constraints and failure modes.
2. If any technical behavior is uncertain or likely to have changed, look it up before documenting it.
3. Prefer Context7 MCP for up-to-date library, framework, and provider documentation when relevant.
4. Prefer official docs and primary sources for unstable topics such as provider features, structured-output behavior, caching, and token-management behavior.
5. If uncertainty remains after codebase review and documentation lookup, record that uncertainty explicitly instead of pretending the design is settled.

Recommended repo entrypoints for this roadmap:

- `apps/bot/src/customerConversationRouter.ts`
- `apps/bot/src/conversationStore.ts`
- `convex/conversations.ts`
- `packages/rag/src/index.ts`
- `packages/ai/src/chat/prompt.ts`
- `packages/ai/src/chat/manager.ts`

## Why The Current Architecture Feels Stateless
The current bot already persists message history and includes recent turns in the model request, but its overall architecture still produces a turn-local experience.

The core issues are:

- Retrieval runs on the latest inbound text before contextual resolution.
- `empty` and `low_signal` retrieval outcomes short-circuit too early.
- Conversation memory is mostly raw text, not canonical machine-usable state.
- There is no rolling summary for durable long-range memory.
- History trimming is destructive instead of archival or summary-backed.
- Idle reset drops too much context.
- Assistant turns do not persist enough semantic structure for later reasoning.
- Structured output handling will become more brittle as prompt layers grow.

## Design Principles
Every step in this roadmap must preserve these rules:

1. Conversation state is first-class and may not be reconstructed only from text history.
2. Conversational resolution and factual grounding are different responsibilities.
3. Retrieval must happen after turn resolution, not before it.
4. Summary, canonical state, recent turns, and grounding facts must remain separate typed layers.
5. Cleanup may not destroy information before summary checkpointing or archival.
6. Any behavior-changing step must include observability and rollback guidance.
7. Arabic and English behavior must both be treated as first-class from the start.

## Target Architecture
The target end-to-end flow is:

1. Receive inbound message.
2. Load recent verbatim turns.
3. Load canonical conversation state.
4. Load rolling summary.
5. Resolve the current turn into standalone intent.
6. Perform retrieval using the resolved query and selected entities.
7. Assemble the prompt using typed layers.
8. Obtain structured assistant output.
9. Persist customer-facing text and semantic metadata.
10. Update conversation state and summary.
11. Emit observability events.
12. Apply retention and archival rules.

Typed context layers in the final system:

- Behavior instructions: how the assistant should reason and respond.
- Rolling summary: durable long-range narrative memory.
- Canonical state: current machine-usable focus and selections.
- Recent turns: local discourse needed for immediate conversational continuity.
- Grounding facts: current factual evidence for catalog claims.

## Step Dependency Map
The implementation order is fixed unless a step file explicitly states otherwise.

| Step | Summary | Depends On | Unblocks |
| --- | --- | --- | --- |
| [Step 0](./step_0_baseline_diagnostics_and_guardrails.md) | Baseline diagnostics and guardrails | None | All behavior-changing work |
| [Step 1](./step_1_canonical_conversation_state.md) | Canonical conversation state | Step 0 | Steps 2, 4, 6, 7 |
| [Step 2](./step_2_semantic_assistant_turn_persistence.md) | Semantic assistant persistence | Step 1 | Steps 4, 6, 8 |
| [Step 3](./step_3_context_assembly_contract.md) | Typed prompt assembly contract | Steps 0, 1 | Steps 4, 5, 6, 8 |
| [Step 4](./step_4_turn_resolution_and_query_rewriting.md) | Turn resolution and standalone query rewriting | Steps 1, 2, 3 | Step 5 |
| [Step 5](./step_5_retrieval_refactor.md) | Retrieval refactor around resolved intent | Step 4 | Steps 8, 9, 10 |
| [Step 5.5](./step_5_5_catalog_access_mediation_and_multi_entity_grounding.md) | Catalog access mediation and multi-entity grounding | Step 5 | Steps 8, 9, 10 |
| [Step 6](./step_6_rolling_summary_and_memory_hierarchy.md) | Rolling summary and memory hierarchy | Steps 1, 2, 3 | Step 7 |
| [Step 7](./step_7_retention_archival_and_token_budget_policy.md) | Retention, archival, and token-budget policy | Step 6 | Step 10 |
| [Step 8](./step_8_structured_output_hardening.md) | Structured-output hardening | Steps 2, 3, 5 | Step 9 |
| [Step 9](./step_9_incremental_rollout_and_regression_prevention.md) | Rollout and regression prevention | Steps 0, 5, 8 | Step 10 |
| [Step 10](./step_10_legacy_simplification_and_final_convergence.md) | Legacy simplification | Step 9 | Final steady-state architecture |

Dependency rules that may not be violated:

- Step 0 must land before user-visible behavior changes.
- Step 1 must exist before Step 4.
- Step 2 must exist before Step 6 and Step 8.
- Step 3 must exist before richer prompt layering is rolled out.
- Step 4 must exist before Step 5.
- Step 6 must exist before Step 7.
- Step 8 must be hardened before major rollout.
- Step 10 may only happen after Step 9 proves stability.

## Ordered Roadmap Steps

### Step 0: Baseline Diagnostics and Guardrails
Define the measurement layer, evaluation cases, and rollback scaffolding needed before changing user-visible behavior.

### Step 1: Canonical Conversation State
Introduce a machine-usable source of truth for current focus, selections, and conversational continuity.

### Step 2: Semantic Assistant Turn Persistence
Persist assistant meaning, not only assistant text, so later steps can rely on canonical records of what the bot showed and decided.

### Step 3: Context Assembly Contract
Define the typed prompt layers and prevent future contributors from collapsing summary, state, history, and grounding into one blob.

### Step 4: Turn Resolution and Query Rewriting
Resolve ambiguous user turns into standalone intent before retrieval.

### Step 5: Retrieval Refactor
Refactor RAG to consume resolved intent and entity state instead of raw latest-turn text.

### Step 5.5: Catalog Access Mediation and Multi-Entity Grounding
Define the customer-safe catalog grounding surface so the assistant can reason over categories, products, variants, offers, and pricing facts without prompting from raw storage shape.

### Step 6: Rolling Summary and Memory Hierarchy
Introduce durable summary memory without confusing it with canonical state or grounding facts.

### Step 7: Retention, Archival, and Token-Budget Policy
Replace crude destructive trimming with summary-backed retention and prompt-layer budgeting.

### Step 8: Structured Output Hardening
Harden structured-output handling so the control plane remains stable as prompt complexity grows.

### Step 9: Incremental Rollout and Regression Prevention
Define shadow mode, canaries, acceptance thresholds, and rollback rules for the new stack.

### Step 10: Legacy Simplification and Final Convergence
Remove obsolete behavior only after the replacement stack has been proven in production.

## Cross-File Validation Matrix

| Scenario | Primary Step Owner | Supporting Steps |
| --- | --- | --- |
| Numbered referent resolution (`الثاني`) | Step 4 | Steps 1, 2, 5 |
| Pronoun resolution (`its large size`) | Step 4 | Steps 1, 2, 5 |
| Arabic multi-turn follow-up | Step 4 | Steps 3, 5, 8 |
| English multi-turn follow-up | Step 4 | Steps 3, 5, 8 |
| Long idle gap with stable state retained | Step 1 | Steps 6, 7 |
| Quoted reply to stale content | Step 1 | Steps 4, 7 |
| Raw query low-signal but recoverable after resolution | Step 5 | Steps 4, 8 |
| Category question answered from mediated grounding rather than product-only search | Step 5.5 | Steps 3, 5, 8 |
| Summary present while recent turns are short | Step 6 | Steps 3, 7 |
| Malformed structured output with repair path | Step 8 | Steps 3, 9 |
| Clarification vs handoff boundary | Step 8 | Steps 5, 9 |
| Mixed media turns without polluting useful context | Step 7 | Steps 3, 6 |

## Global Non-Goals
This roadmap does not cover:

- Personality redesign as the primary fix
- Admin UI redesign
- New product-domain features unrelated to conversational intelligence
- Transport replacement
- Prompt wording alone as the solution

## Final Build Order Summary
Implement this roadmap in order:

1. Diagnostics and guardrails
2. Canonical state
3. Semantic assistant persistence
4. Typed context assembly
5. Turn resolution and query rewriting
6. Retrieval refactor
7. Catalog access mediation and multi-entity grounding
8. Rolling summary
9. Retention and token-budget policy
10. Structured-output hardening
11. Rollout and regression prevention
12. Legacy simplification

If a later step appears attractive before an earlier step is complete, treat that as a signal that the prerequisites need to be tightened, not skipped.
