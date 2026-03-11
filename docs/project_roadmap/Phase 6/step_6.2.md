### Step 6.2: History Window Assembly
**Goal**: Build the conversation-history window used by shared chat orchestration without letting message history grow unbounded.

**Current baseline**:
- Messages are already stored in Convex, but no history-window policy exists yet.
- Phase 4.6 depends on a reusable history input for prompt assembly.
- The product intent calls for conversational continuity while remaining cost-conscious.

**Next work**:
- [ ] Define the default history window size and what counts toward it.
- [ ] Add ordered history reads and trimming helpers for older messages.
- [ ] Decide whether trimming should happen inline, in a background job, or both.
- [ ] Expose a history format that can be consumed directly by the shared AI chat orchestrator.

**Verification**:
- History reads are ordered and limited predictably.
- Trimming removes only the oldest excess messages and does not break active conversation state.

**Tests**:
- History retrieval covers empty, partial, and over-limit conversations.
- Trimming behavior is deterministic and tenant-scoped.

**Dependencies / Notes**:
- Keep token-budget concerns in mind so prompt assembly can bound costs without adding transport-specific logic.
