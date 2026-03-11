### Step 6.3: Human Handoff And Auto-Resume
**Goal**: Use the existing `muted` conversation state to support human takeover and safe bot resumption.

**Current baseline**:
- `conversations` already store `muted` and `mutedAt`.
- No runtime flow currently sets or clears handoff state.
- The charter expects customer-facing human handoff plus automatic resume after an inactivity window.

**Next work**:
- [ ] Define how customer requests, owner actions, or low-confidence AI outcomes trigger mute state.
- [ ] Add owner notification behavior with enough conversation context for handoff.
- [ ] Define and implement auto-resume timing and the responsible scheduler boundary.
- [ ] Ensure muted conversations bypass automated reply generation until explicitly or automatically resumed.

**Verification**:
- Handoff state prevents bot replies for the muted conversation only.
- Resume behavior is deterministic and leaves an auditable state transition trail.

**Tests**:
- Mute, manual resume, and auto-resume flows are all covered.
- Muted conversations remain isolated from unaffected tenant conversations.

**Dependencies / Notes**:
- Auto-resume scheduling may land in Convex jobs, `apps/worker`, or a hybrid model defined later in Phase 9.
