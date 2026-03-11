### Step 5.3: QR Pairing And Operational Visibility
**Goal**: Make tenant pairing and bot runtime status observable enough to operate locally without a dashboard.

**Current baseline**:
- No QR pairing flow or runtime visibility exists yet in `apps/bot`.
- The project is intentionally API-first and dashboard-free for now, so operator feedback must come from logs and simple runtime output.
- The current environment is local and Windows-first, which affects how pairing artifacts should be displayed or stored.

**Next work**:
- [ ] Implement QR presentation for unpaired sessions in a way that works in the current local workflow.
- [ ] Record connection state transitions such as connecting, open, closed, and retrying with tenant context.
- [ ] Define a minimal operator-facing status surface, such as structured logs or a future status command hook.
- [ ] Decide how pairing retries and expired QR flows should be surfaced without spamming logs.

**Verification**:
- An unpaired company can be paired without attaching a debugger or editing source code.
- Operators can distinguish healthy, reconnecting, and unpaired sessions from logs alone.

**Tests**:
- Connection-state transitions produce stable status outputs.
- QR generation and expiry handling are exercised with isolated runtime tests where feasible.

**Dependencies / Notes**:
- Keep this step compatible with future owner-facing `!status` output in Phase 7.2.
