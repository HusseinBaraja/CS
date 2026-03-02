### Step 1.3: Logging System
**Goal**: Implement structured logging with Pino.

**Tasks**:
- [ ] Install `pino` and `pino-pretty`
- [ ] Create `src/utils/logger.ts`
- [ ] Configure log levels based on environment (`dev` = debug, `prod` = info)
- [ ] Add pretty-printing for development
- [ ] Add log file output for production
- [ ] Implement sensitive data redaction (phone numbers, API keys)

**Verification**:
- Logs appear in console with proper formatting
- Log levels work correctly
- Sensitive data is redacted in output

**Tests**:
- Logger outputs at correct levels
- Redaction strips sensitive fields
