### Step 1.4: Error Handling System
**Goal**: Create centralized error handling utilities.

**Tasks**:
- [x] Create `errors.ts` in the shared package
- [x] Create error types:
  - `AppError` — base class with `code`, `message`, `cause`, `toJSON()`
  - `ConfigError` — missing/invalid configuration
  - `DatabaseError` — connection or query failures
  - `AIError` — provider failures, timeouts
  - `WhatsAppError` — Baileys connection issues
  - `AuthError` — API authentication failures
  - `ValidationError` — input validation failures

- [x] Add error formatting utilities for structured logging
- [x] Add error code constants
- [x] Distinguish missing configuration from invalid configuration at the error-code level

**Verification**:
- Custom errors contain proper metadata (code, message, cause)
- Errors log with full context via Pino

**Tests**:
- Each error type serializes correctly
- Error hierarchy works (instanceof checks)
