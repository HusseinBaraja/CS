### Step 6.7: Conversation Reset And Cleanup
**Goal**: Define how stale conversations age out, reset context, and get cleaned up across bot and job boundaries.

**Current baseline**:
- Conversation and message data already exist, but there is no idle-reset or cleanup policy.
- Auto-resume and history-window behavior both depend on explicit lifecycle rules.
- `apps/worker` exists but has not yet been assigned concrete cleanup responsibilities.

**Next work**:
- [ ] Define idle timeout rules for conversation-context reset versus full data retention.
- [ ] Decide which cleanup operations are inline, scheduled in Convex, or delegated to `apps/worker`.
- [ ] Add any missing timestamps or metadata required for cleanup decisions.
- [ ] Keep cleanup logic tenant-safe and retry-safe.

**Verification**:
- Stale conversations stop influencing new AI context after the configured idle window.
- Cleanup jobs can restart safely without deleting active or recently resumed conversation state.

**Tests**:
- Idle timeout, stale reset, and scheduler retry cases are covered.
- Cleanup logic does not delete unrelated tenant records.

**Dependencies / Notes**:
- Align this step with the worker-boundary decisions in Phase 9 before introducing irreversible cleanup automation.
