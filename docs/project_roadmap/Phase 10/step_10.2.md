### Step 10.2: Graceful Degradation
**Goal**: Expand the existing readiness and config foundation into runtime behaviors that fail safely for customers and operators.

**Current baseline**:
- The API already has readiness checks, config validation, and controlled error responses.
- Provider failover, bot session recovery, and customer-facing fallback behavior are not implemented yet.
- Bot and worker runtimes remain early enough that graceful-degradation rules should be designed before complex flows are added.

**Next work**:
- [ ] Define safe customer-facing fallback messages for retrieval misses, provider outages, and muted or unavailable sessions.
- [ ] Add reconnect and retry policies for bot sessions that do not crash the full runtime.
- [ ] Ensure the provider manager and action executor classify failures in a way the runtime can degrade gracefully.
- [ ] Add operator-visible warnings for degraded modes so failures are not silent.

**Verification**:
- The system remains operable when one AI provider, one tenant session, or one background task fails.
- Customers receive safe fallbacks instead of hanging requests or misleading answers.

**Tests**:
- Failure-path tests cover provider outages, retrieval failures, send failures, and session disconnects.
- Runtime tests confirm uncaught errors in one tenant flow do not bring down unrelated flows.

**Dependencies / Notes**:
- Reuse the existing error and logging packages instead of introducing runtime-specific error conventions.
