### Step 9.5: External Failure Recovery
**Goal**: Add recovery patterns for failures that involve external providers, media services, or unstable transport state.

**Current baseline**:
- The current codebase already has examples of careful external-call handling, especially around embedding generation.
- Planned AI, media, and WhatsApp flows will all introduce more external failure modes than the current API-only baseline.
- No shared reconciliation or retry policy exists yet beyond local adapter logic.

**Next work**:
- [ ] Define retry versus reconciliation behavior for AI provider failures, media service failures, and WhatsApp send failures.
- [ ] Add dead-letter or manual-recovery visibility where fully automated retries would be unsafe.
- [ ] Ensure failures do not leave partial tenant-visible state without a recovery path.
- [ ] Reuse shared error taxonomies and logging fields across runtimes.

**Verification**:
- External failures either recover automatically or surface a clear operator signal.
- Partial success does not silently corrupt catalog or conversation state.

**Tests**:
- Failure-injection tests cover retryable and terminal failures for each external system class.
- Recovery tests confirm duplicate retries do not create conflicting tenant state.

**Dependencies / Notes**:
- Treat external recovery as cross-cutting infrastructure, not as ad hoc logic inside individual handlers.
