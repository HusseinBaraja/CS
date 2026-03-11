### Step 9.6: Operational Automation Hooks
**Goal**: Connect worker jobs, CLI operations, backups, and seed flows into one coherent operational model.

**Current baseline**:
- `apps/cli` already supports seed and backup workflows.
- Backup behavior is already documented in `docs/operations/convex-backups.md`.
- `apps/worker` does not yet own concrete automation jobs.

**Next work**:
- [ ] Document and implement how background automation is started, monitored, and recovered in local operation.
- [ ] Define which maintenance tasks are operator-invoked through CLI versus automatically scheduled.
- [ ] Add any shared runtime hooks needed for logging, locking, or job ownership across worker and Convex.
- [ ] Keep seed, backup, and future maintenance jobs aligned with tenant isolation and failure-recovery requirements.

**Verification**:
- Operators can reason about which tasks are automatic and which are manual.
- Background automation does not conflict with existing CLI and Convex workflows.

**Tests**:
- Automation tests cover lock handling, duplicate execution prevention, and logging hooks where applicable.
- Operational documentation is verified against the actual command and runtime surface.

**Dependencies / Notes**:
- Reuse the existing lock and cleanup patterns already present in `convex/seed.ts` and `convex/companyCleanup.ts` where appropriate.
