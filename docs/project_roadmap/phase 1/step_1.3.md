### Step 1.3: Logging System
**Goal**: Implement structured logging with Pino.

**Tasks**:
- [x] Create the shared logger in `packages/core`
- [x] Pretty-print logs in non-production environments
- [x] Respect `LOG_LEVEL` from shared config
- [x] Redact sensitive fields including phone number fields
- [x] Write production logs to rotating daily files with retention
- [x] Add logger tests for level filtering, redaction, error logging, and file rotation

**Verification**:
- Logs appear in console with proper formatting
- Log levels work correctly
- Sensitive data is redacted in output
- Production logs are written to daily files and old files are pruned

**Tests**:
- Logger outputs at correct levels
- Redaction strips sensitive fields
- Production log files rotate and retention cleanup works
