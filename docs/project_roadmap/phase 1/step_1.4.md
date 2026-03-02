### Step 1.4: Error Handling System
**Goal**: Create centralized error handling utilities.

**Tasks**:
- [ ] Create `src/utils/errors.ts` — custom error classes
- [ ] Create error types:
  - `ConfigError` — missing/invalid configuration
  - `DatabaseError` — connection or query failures
  - `AIError` — provider failures, timeouts
  - `WhatsAppError` — Baileys connection issues
  - `AuthError` — API authentication failures
  - `ValidationError` — input validation failures

- [ ] Add error formatting utilities (structured JSON for logging)
- [ ] Add error code constants


**Verification**:
- Custom errors contain proper metadata (code, message, cause)
- Errors log with full context via Pino

**Tests**:
- Each error type serializes correctly
- Error hierarchy works (instanceof checks)