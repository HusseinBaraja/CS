### Step 12.3: Troubleshooting And Operator Runbooks
**Goal**: Document the operational failures most likely to occur in the current local-first environment.

**Current baseline**:
- `docs/operations/convex-backups.md` already covers backup and restore guidance.
- The API already has readiness, config, and auth behaviors worth documenting for operators.
- Future bot, provider, and media features will introduce more runtime-specific failure modes that need explicit runbooks.

**Next work**:
- [ ] Add troubleshooting guidance for Convex URL and admin key issues, readiness failures, and API auth problems.
- [ ] Add runbooks for Gemini embedding failures and future provider failover issues.
- [ ] Add runbooks for Baileys pairing, reconnect loops, and tenant-session operational checks once the bot runtime lands.
- [ ] Document backup, restore, and data-recovery expectations alongside cleanup and job behavior where relevant.

**Verification**:
- Operators can diagnose the most common environment and runtime failures without reading source code.
- Runbooks reference the actual commands, logs, and files used by the project.

**Tests**:
- Documentation review checks that each runbook matches the current commands and runtime outputs.
- Recovery steps are validated against existing operations docs and CLI behavior.

**Dependencies / Notes**:
- Keep troubleshooting docs grounded in the current Windows-first local operating model until deployment assumptions change.
