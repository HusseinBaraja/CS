### Step 7.2: Operational Commands
**Goal**: Implement the first owner commands for runtime visibility and operator guidance.

**Current baseline**:
- No owner-command handlers exist yet.
- The current project already has meaningful runtime surfaces such as bot session state, API readiness patterns, and seeded tenant data that later commands can expose.
- The charter explicitly calls for commands such as `!help`, `!status`, and `!list`.

**Next work**:
- [ ] Implement `!help` with the supported command set and expected argument formats.
- [ ] Implement `!status` with runtime-aware output for the tenant session and relevant service health.
- [ ] Implement `!list` for owner-facing catalog or configuration summaries, keeping output concise enough for WhatsApp.
- [ ] Keep command rendering centralized so formatting stays consistent across operators and tenants.

**Verification**:
- Commands return useful, tenant-scoped operational output without leaking cross-tenant state.
- Status output is understandable from WhatsApp alone.

**Tests**:
- Command handler tests cover success, unsupported state, and formatting edge cases.
- `!status` tests cover disconnected, reconnecting, and healthy runtime states.

**Dependencies / Notes**:
- Reuse shared formatting helpers from the outbound delivery layer instead of building ad hoc WhatsApp text in each command.
