### Step 10.3: Production Logging And Observability
**Goal**: Extend the existing structured logging foundation across bot, AI, and background execution paths.

**Current baseline**:
- `@cs/core` already provides structured logging with redaction and retention behavior.
- API readiness and configuration failures already use the logging stack.
- Bot sessions, provider failovers, job execution, and tenant-scoped runtime signals are not yet instrumented.

**Next work**:
- [ ] Add structured logs for bot lifecycle, session transitions, inbound routing, and outbound sends.
- [ ] Add logs for provider choice, failover, retrieval quality, and action execution outcomes.
- [ ] Add logs and basic operational counters for worker or scheduled job execution.
- [ ] Define which tenant identifiers are safe to log and which must stay redacted or omitted.

**Verification**:
- Operators can trace failures across API, bot, and job boundaries from structured logs alone.
- Sensitive values remain redacted in all newly added logs.

**Tests**:
- Logging tests cover redaction, event-shape stability, and critical lifecycle log emission.
- Failure-path tests confirm meaningful operational logs are produced when degraded behavior occurs.

**Dependencies / Notes**:
- Keep observability consistent with the current `@cs/core` logger rather than introducing runtime-specific logging stacks.
