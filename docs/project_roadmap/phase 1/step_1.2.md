### Step 1.2: Environment Configuration
**Goal**: Set up type-safe, environment-based configuration management.

**Tasks**:
- [x] Install `@t3-oss/env-core` and `zod`
- [x] Create the shared config package in `packages/config`
- [x] Validate configuration with clear startup errors via `ConfigError`
- [x] Add default values for optional settings
- [x] Create and maintain `.env.example`
- [x] Add config tests for defaults, invalid values, and missing required runtime values

**Current active environment contract**:
```typescript
{
  NODE_ENV: "development" | "test" | "production",
  LOG_LEVEL: "debug" | "info" | "warn" | "error",
  LOG_DIR: string, // Default: "logs"
  LOG_RETENTION_DAYS: number, // Default: 14
  API_PORT: number, // Default: 3000
  CONVEX_URL?: string // Required by db-backed runtimes
}
```

**Deferred configuration**:
- AI provider keys, embeddings, storage credentials, and API auth keys are intentionally deferred until those integrations move beyond stub implementations.

**Verification**:
- Missing required env vars throw clear, descriptive error messages
- Config object is fully typed and accessible throughout app
 
**Tests**:
- Missing required var → throws `ConfigError`
- Invalid value (e.g., wrong enum) → throws with validation message
- Defaults applied when optional vars missing
