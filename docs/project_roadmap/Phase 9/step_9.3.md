### Step 9.3: Analytics Rollups And Reports
**Goal**: Add asynchronous analytics rollups and owner-facing report generation on top of the event stream.

**Current baseline**:
- The project already models analytics events, but no scheduled report flow exists.
- The charter calls for actionable analytics and eventual owner-facing summaries.
- Real-time API reads should remain possible even if rollups are added later for efficiency.

**Next work**:
- [ ] Decide whether rollups are required for performance or only for scheduled report delivery.
- [ ] Implement daily and weekly summary generation if the event volume or owner experience justifies it.
- [ ] Define report delivery targets, formats, and retry behavior.
- [ ] Ensure rollups are derivable from source events and do not become the only trusted source of truth.

**Verification**:
- Scheduled summaries match the underlying analytics events for the same time window.
- Report generation failures are observable and retryable.

**Tests**:
- Rollup tests compare aggregated outputs against raw-event calculations.
- Scheduling tests cover missed runs, retries, and empty-data summaries.

**Dependencies / Notes**:
- Keep report generation aligned with the analytics API contract instead of inventing a separate metric vocabulary.
