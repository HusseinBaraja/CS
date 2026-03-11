## Phase 5: Bot Runtime Foundation
### Step 5.1: Baileys Runtime Bootstrapping
**Goal**: Replace the current placeholder bot bootstrap with a real Baileys runtime in `apps/bot`.

**Current baseline**:
- `apps/bot` already exists and depends on `@whiskeysockets/baileys`, but its entrypoint is still a minimal `mockChat` bootstrap.
- The roadmap no longer needs to plan basic package installation or app creation from scratch.
- The charter still expects WhatsApp-based operation, QR pairing, and persisted sessions.

**Next work**:
- [ ] Add a real runtime entrypoint in `apps/bot` that initializes Baileys and handles connection lifecycle events.
- [ ] Choose and implement local auth-state persistence suitable for the current Windows-first environment.
- [ ] Add clean startup and shutdown behavior that integrates with the existing logging package.
- [ ] Separate transport bootstrap from higher-level message orchestration so later steps can stay modular.

**Verification**:
- Bot startup reaches a connectable Baileys state and logs meaningful lifecycle transitions.
- Session state survives process restarts without forcing unnecessary re-pairing.

**Tests**:
- Connection-state handling is covered with unit tests or isolated runtime tests where practical.
- Bootstrapping code fails safely when required WhatsApp runtime prerequisites are missing.

**Dependencies / Notes**:
- Do not run `bun dev` as part of roadmap execution or validation in this repo.
