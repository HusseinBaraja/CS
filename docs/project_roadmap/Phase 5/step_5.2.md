### Step 5.2: Tenant Session Manager
**Goal**: Manage one WhatsApp runtime session per company without weakening tenant isolation.

**Current baseline**:
- Companies already exist as first-class tenant records in Convex and through the API.
- No bot-side company runtime mapping or session manager exists yet.
- Multi-tenant isolation is a core product requirement and must be explicit in the bot runtime architecture.

**Next work**:
- [ ] Define how `apps/bot` discovers which companies should have active WhatsApp sessions.
- [ ] Add a session manager that maps company identity to auth state, socket lifecycle, and runtime metadata.
- [ ] Define how owner phone, timezone, and future access-control config become available to message handlers.
- [ ] Ensure a session failure for one company does not crash or block another tenant.

**Verification**:
- Session state is isolated per company and can be reasoned about independently.
- Bot runtime can enumerate which tenant sessions are active, disconnected, or awaiting pairing.

**Tests**:
- Unit tests cover session registration, teardown, lookup, and failure isolation.
- Runtime tests verify one tenant’s reconnect path does not corrupt another tenant’s state.

**Dependencies / Notes**:
- Keep tenant metadata loading modular so future worker or CLI tooling can reuse the same company runtime model.
