### Step 1.3: Logging System
**Goal**: Implement structured logging with Pino.

**Tasks**:
- [ ] Create `packages/core/src/logger.ts`
- [ ] Import log level from `@cs/config`
- [ ] Configure log levels based on `LOG_LEVEL` env var (fallback: `debug` in dev, `info` in prod)
- [ ] Add `pino-pretty` transport for development
- [ ] Add sensitive data redaction (phone numbers, API keys, tokens)

**Verification**:
- Logs appear in console with proper formatting
- Log levels work correctly
- Sensitive data is redacted in output

**Tests**:
- Logger outputs at correct levels
- Redaction strips sensitive fields
