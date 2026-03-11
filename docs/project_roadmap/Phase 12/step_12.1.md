## Phase 12: Documentation And Operations
### Step 12.1: Developer Documentation
**Goal**: Enable a new developer to set up and contribute.

**Current baseline**:
- `README.md` already documents the current setup, scripts, and active environment variables.
- `AGENTS.md` already captures several important implementation pitfalls and workflow rules.
- The rewritten roadmap now needs the rest of the documentation set to match the real monorepo structure.

**Next work**:
- [ ] Expand `README.md` and companion docs with an architecture overview for `apps/*`, `packages/*`, and `convex`.
- [ ] Add setup guidance for future bot and worker runtime prerequisites once those features land.
- [ ] Document the relationship between the charter, SRS, roadmap, and operational docs.
- [ ] Keep `.env.example` aligned with the actual runtime contract rather than aspirational variables.

**Verification**:
- A new contributor can identify where core responsibilities live in the monorepo.
- Environment documentation matches the code that currently reads the variables.

**Tests**:
- Documentation review confirms setup steps and script names match the real workspace.
- Environment variable docs are checked against `packages/config/src/index.ts`.

**Dependencies / Notes**:
- Prefer truthful current-state documentation over speculative future-state setup instructions.
