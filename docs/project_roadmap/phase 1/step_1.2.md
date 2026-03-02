---  
### Step 1.2: Environment Configuration
**Goal**: Set up type-safe, environment-based configuration management.

**Tasks**:
- [ ] Install `@t3-oss/env-core` and `zod`
- [ ] Create `src/config/env.ts` — type-safe env validation
- [ ] Validate required environment variables on startup with clear error messages
- [ ] Add default values for optional settings
- [ ] Create `.env.example` template file


**Configuration categories**:
```typescript
{
    // Convex
    CONVEX_URL: string,  // Convex deployment URL (auto-set by Convex CLI)

    // AI Providers
    AI_PROVIDER: "deepseek" | "gemini" | "groq",  // Active provider
    DEEPSEEK_API_KEY: string,
    DEEPSEEK_BASE_URL: string,
    GEMINI_API_KEY: string,
    GROQ_API_KEY: string,

    // Embeddings
    EMBEDDING_API_KEY: string, // Gemini key for embeddings

    // Cloudflare R2
    R2_ACCOUNT_ID: string,
    R2_ACCESS_KEY_ID: string,
    R2_SECRET_ACCESS_KEY: string,
    R2_BUCKET_NAME: string,
    R2_PUBLIC_URL: string,  // Public bucket URL for serving images
    
    // API
    API_PORT: number,  // Default: 3000
    API_KEY: string,  // REST API authentication

    // General
    NODE_ENV: "development" | "production",
    LOG_LEVEL: "debug" | "info" | "warn" | "error",
}
```

**Verification**:
- Missing required env vars throw clear, descriptive error messages
- Config object is fully typed and accessible throughout app
  **Tests**:
- Missing required var → throws `ConfigError`
- Invalid value (e.g., wrong enum) → throws with validation message
- Defaults applied when optional vars missing