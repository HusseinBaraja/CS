# Phase 1 Environment Analysis — Issues Found

Based on a full audit of the Phase 1 docs (steps 1.2–1.4), the SRS (FR-1.x, FR-2.x, FR-3.x), the Project Charter, and the current codebase.

---

## Summary

Phase 1 has three deliverables: **config**, **logging**, and **error handling**. All three are partially implemented but have gaps against the SRS requirements.

| Area | Status | Verdict |
|------|--------|---------|
| Config (`@cs/config`) | ⚠️ Partial | Most env vars incorrectly optional |
| Logging (`@cs/core`) | ⚠️ Partial | Missing production features, phone redaction |
| Error Handling (`@cs/shared`) | ✅ Mostly done | Solid, minor gaps |
| Tests | ⚠️ Partial | No config tests at all |

---

## Issues

### 1. 🔴 All Required Env Vars Are Optional

**File**: [index.ts](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/config/src/index.ts)

The SRS (FR-1.1) and step 1.2 require that required environment variables are **validated on startup** and throw clear errors when missing. Currently, every single env var is marked `.optional()`:

```diff
- CONVEX_URL: z.string().url().optional(),
- AI_PROVIDER: z.enum(["deepseek", "gemini", "groq"]).optional(),
- DEEPSEEK_API_KEY: z.string().optional(),
- API_KEY: z.string().optional(),
+ CONVEX_URL: z.string().url(),
+ AI_PROVIDER: z.enum(["deepseek", "gemini", "groq"]).default("deepseek"),
+ DEEPSEEK_API_KEY: z.string().min(1),
+ API_KEY: z.string().min(1),
```

> [!CAUTION]
> This means the app can start with no API keys, no Convex URL, no R2 credentials — and only crash later when features try to use them. This contradicts FR-1.1 ("validate on startup") and FR-1.2 ("throw descriptive ConfigError").

---

### 2. 🔴 Config Package Doesn't Throw [ConfigError](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/shared/src/errors.ts#114-119)

**SRS FR-1.2**: "Throw descriptive [ConfigError](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/shared/src/errors.ts#114-119) on missing or invalid env vars."

The `@cs/config` package has no dependency on `@cs/shared` and never throws [ConfigError](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/shared/src/errors.ts#114-119). When `t3-env` validation fails, it throws a generic error from Zod — not the project's own [ConfigError](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/shared/src/errors.ts#114-119) class.

---

### 3. 🔴 No Config Tests Exist

**Step 1.2 Verification** requires tests for:
- Missing required var → throws [ConfigError](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/shared/src/errors.ts#114-119)
- Invalid value → throws with validation message
- Defaults applied when optional vars missing

There is **no test file** in `packages/config/` at all.

---

### 4. 🟡 Logger Ignores `LOG_LEVEL` from Config

**File**: [index.ts](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/core/src/index.ts#L19)

```typescript
// Current — hardcoded logic, ignores @cs/config
level: process.env.NODE_ENV === "production" ? "info" : "debug",
```

The SRS (FR-2.2) says: "Log level set by environment (`dev` = debug, `prod` = info)." The `LOG_LEVEL` env var exists in config but the logger never reads it. Instead, it directly reads `process.env.NODE_ENV` and applies its own defaults.

This also means `@cs/core` doesn't use `@cs/config` — the config package is wasted here.

---

### 5. 🟡 Missing Phone Number Redaction in Logs

**SRS FR-2.5**: "Redact sensitive data (**phone numbers**, API keys) from all log output."

Current redact paths:
```typescript
const redactPaths = [
  "password", "token", "authorization", "apiKey", "secret",
  "*.password", "*.token", "*.authorization", "*.apiKey", "*.secret"
];
```

**Missing**: `phoneNumber`, `phone`, `ownerPhone`, `*.phoneNumber`, `*.phone`. For a WhatsApp bot, phone numbers are the primary PII and must be redacted per the SRS.

---

### 6. 🟡 No Production Log File Rotation

**SRS FR-2.4**: "Write logs to file in production with daily rotation (14-day keep)."

The current logger only has two modes: pretty-print (dev) or plain JSON (prod). There is **no file transport, no rotation, no retention policy**. In production, logs will just go to stdout with no file.

---

### 7. 🟡 `db` Package Bypasses Config Validation

**File**: [index.ts](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/db/src/index.ts)

```typescript
// Reads process.env directly instead of using @cs/config
url: process.env.CONVEX_URL
```

This bypasses the validated config entirely — defeating the purpose of `@cs/config`.

---

### 8. 🟢 Convex Schema is Empty (Expected)

**File**: [schema.ts](file:///c:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/convex/schema.ts)

Just a placeholder `export {}`. This is expected since the Convex schema is Phase 2 work (FR-4.x).

---

### 9. 🟢 `ConfigError` Doesn't Distinguish Missing vs Invalid

The `ConfigError` class always uses `ERROR_CODES.CONFIG_INVALID`. There's a separate `CONFIG_MISSING` error code defined but never used. Minor, but the SRS implies two distinct scenarios: missing vs invalid.

---

### 10. 🟡 Step 1.1 (Project Setup) Doc is Missing

Phase 1 has steps 1.2, 1.3, and 1.4 — but no `step_1.1.md`. The Charter lists Phase 1 milestone as "Project foundation (config, logging, errors)" and the SRS appendix shows Phase 1 covers FR-1.x, FR-2.x, FR-3.x. Step 1.1 (project scaffolding / monorepo setup) appears to have been done but its doc is missing from the roadmap.

---

## What's Working Well

- ✅ **Error hierarchy** — clean inheritance, `instanceof` works, `toJSON()` serialization, circular reference handling
- ✅ **Error tests** — solid 93-line test file covering hierarchy, serialization, and `formatError`
- ✅ **Logger tests** — level filtering, redaction, and error formatting tests
- ✅ **Monorepo structure** — Turborepo + path aliases properly configured
- ✅ **`.env.example`** — documents all expected vars with grouping and comments
- ✅ **Modular architecture** — small, focused packages following the Charter's constraints

---

## Priority Order for Fixes

| Priority | Issue | Impact |
|----------|-------|--------|
| 1 | Required env vars all optional | App silently starts broken |
| 2 | No config tests | Can't verify fix for #1 |
| 3 | Config doesn't throw `ConfigError` | Violates SRS FR-1.2 |
| 4 | Logger ignores `LOG_LEVEL` | Config package unused by core |
| 5 | Phone number redaction missing | PII leak risk |
| 6 | No production log rotation | Ops risk in production |
| 7 | `db` package bypasses config | Inconsistent pattern |
