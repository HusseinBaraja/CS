### Step 9.2: Scheduled Conversation Jobs
**Goal**: Implement the time-based jobs required for conversation auto-resume, stale resets, and similar lifecycle work.

**Current baseline**:
- Conversation mute state and timestamps already exist in the schema.
- No scheduler currently performs conversation maintenance.
- Worker and Convex job ownership is still to be finalized in Phase 9.1.

**Next work**:
- [ ] Implement scheduled handling for auto-resume after handoff windows.
- [ ] Add stale conversation reset or archival logic if required by the finalized lifecycle policy.
- [ ] Ensure scheduled jobs are idempotent and safe under retries or partial failure.
- [ ] Add logging and metrics hooks for scheduled state transitions.

**Verification**:
- Timed conversation state changes happen exactly once from the user’s perspective.
- Failed job attempts can retry without corrupting conversation state.

**Tests**:
- Time-based tests cover due, not-yet-due, and already-processed conversations.
- Retry tests confirm duplicate job execution is harmless.

**Dependencies / Notes**:
- Reuse the conversation lifecycle rules from Phase 6 rather than redefining them inside jobs.
