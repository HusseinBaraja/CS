## Phase 9: Async Jobs And Worker Role
### Step 9.1: Worker Boundary Definition
**Goal**: Decide which asynchronous responsibilities stay in Convex and which move into `apps/worker`.

**Current baseline**:
- `apps/worker` exists but currently only initializes a DB connection and logs startup.
- Convex already handles several asynchronous concerns well, including actions, internal mutations, and cleanup batching.
- The current roadmap needs a clear division of responsibility before adding scheduled or retry-heavy background work.

**Next work**:
- [ ] Define the criteria for keeping work inside Convex versus moving it into `apps/worker`.
- [ ] Classify upcoming jobs such as auto-resume, analytics rollups, media cleanup, and reconciliation.
- [ ] Document how worker jobs authenticate to Convex and what observability they must emit.
- [ ] Avoid creating overlapping job implementations across Convex and the worker.

**Verification**:
- Each background responsibility has one clear owner.
- The chosen boundary keeps external API calls and retry behavior predictable.

**Tests**:
- Boundary tests or architecture checks confirm worker-driven jobs call the intended shared abstractions.
- Design review covers retry safety and idempotency assumptions before implementation.

**Dependencies / Notes**:
- External API calls often fit better outside plain Convex mutations; the existing embedding flow is already a useful precedent.
