## Phase 11: Verification Strategy
### Step 11.1: Unit Test Coverage
**Goal**: Extend the current unit-test baseline to cover the remaining shared and runtime logic.

**Current baseline**:
- The repo already has meaningful tests for API routes, Convex functions, config, DB helpers, logger behavior, CLI utilities, and Gemini embedding helpers.
- Bot runtime, chat-provider orchestration, retrieval, conversation services, and command handling are not covered yet because those features do not exist yet.
- The workspace already standardizes on `bun test` and type-driven lint/typecheck checks.

**Next work**:
- [ ] Add unit coverage for provider adapters, failover orchestration, and prompt-building utilities.
- [ ] Add unit coverage for retrieval, conversation services, access control, rate controls, and owner-command parsing.
- [ ] Add unit coverage for currency formatting, catalog formatting, and action parsing.
- [ ] Keep new tests close to the package or app that owns the behavior.

**Verification**:
- New business logic lands with focused tests at the same time as implementation.
- Shared packages expose tested contracts before bot runtime code depends on them.

**Tests**:
- Run `bun test` for the full workspace once the new features land.
- Keep `bun lint` and `bun typecheck` green as part of the same validation pass.

**Dependencies / Notes**:
- Continue following test-driven development for future implementation work.
