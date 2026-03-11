### Step 11.3: Contract Tests
**Goal**: Protect the public and shared contracts that other layers depend on most.

**Current baseline**:
- Existing API route tests already protect several response shapes and error conventions.
- Shared contracts for AI providers, retrieval, owner commands, and analytics summaries do not exist yet.
- As the codebase becomes more package-driven, contract drift becomes a bigger risk than simple file-local bugs.

**Next work**:
- [ ] Add contract tests for public REST API payload shapes and error responses for all managed resources.
- [ ] Add contract tests for shared AI and retrieval interfaces consumed by bot and worker code.
- [ ] Add contract tests for owner-command parsing and analytics summary outputs.
- [ ] Keep contract fixtures stable and intentionally versioned if the API surface expands later.

**Verification**:
- Refactors cannot silently change response shape, error codes, or shared package contracts.
- Cross-package consumers fail fast in tests when a shared contract changes unexpectedly.

**Tests**:
- Contract tests cover the full public API baseline plus new offers, rates, analytics, and media-management routes.
- Shared-package contract tests cover chat orchestration inputs and outputs, retrieval results, and command result formatting.

**Dependencies / Notes**:
- Contract tests should complement, not replace, focused unit and integration tests.
