# Environment Setup Issues

Date: March 6, 2026
Status: Resolved on March 6, 2026. This document is a snapshot of the original audit findings before the fixes were applied.

## Summary

This project's environment setup is partially defined but not enforced. The main problem is that the configuration layer allows the apps to start without required infrastructure settings, so setup failures are deferred until runtime.

## Findings

### 1. Required environment variables are not enforced

Severity: High

File references:
- [packages/config/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/config/src/index.ts#L14)
- [packages/config/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/config/src/index.ts#L17)
- [packages/config/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/config/src/index.ts#L20)

Details:
- `API_KEY`, `CONVEX_URL`, AI provider settings, embedding settings, and R2 settings are all marked optional.
- Importing the config with no `.env` still succeeds and returns defaults plus `null` for unset infrastructure values.
- This allows the project to boot in a misconfigured state instead of failing fast during startup.

Observed behavior:

```json
{"API_PORT":3000,"NODE_ENV":"development","CONVEX_URL":null,"AI_PROVIDER":null}
```

### 2. Database setup bypasses the validated config

Severity: High

File references:
- [packages/db/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/db/src/index.ts#L6)
- [apps/api/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/api/src/index.ts#L9)
- [apps/worker/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/apps/worker/src/index.ts#L1)

Details:
- The DB package reads `process.env.CONVEX_URL` directly instead of consuming `@cs/config`.
- The API health route and worker startup path both use this DB object.
- With no `CONVEX_URL`, the DB object is still created and the app can appear healthy.

Observed behavior:

```json
{"provider":"convex"}
```

### 3. `LOG_LEVEL` is documented but ignored

Severity: Medium

File references:
- [.env.example](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/.env.example#L2)
- [.env.example](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/.env.example#L3)
- [packages/core/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/core/src/index.ts#L18)

Details:
- The example env file documents `LOG_LEVEL`.
- The logger never reads `LOG_LEVEL`.
- Log level is derived only from `NODE_ENV`, so the documented variable currently has no effect.

### 4. Declared and actual Bun versions do not match

Severity: Medium

File references:
- [package.json](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/package.json#L4)

Details:
- The repo declares `bun@1.2.22`.
- The local environment is currently using Bun `1.3.9`.
- That mismatch weakens reproducibility for setup and debugging.

### 5. Dependency versions are floating

Severity: Medium

File references:
- [package.json](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/package.json#L22)
- [packages/config/package.json](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/config/package.json#L16)
- [packages/core/package.json](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/core/package.json#L16)
- [packages/db/package.json](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/db/package.json#L17)

Details:
- Several dependencies are set to `latest`.
- Fresh installs can therefore produce a different toolchain or runtime surface than earlier installs.
- That makes environment recreation less reliable.

### 6. Turbo test outputs are configured incorrectly

Severity: Medium

File references:
- [turbo.json](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/turbo.json#L28)
- [packages/config/package.json](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/config/package.json#L14)

Details:
- Turbo expects test runs to output `coverage/**`.
- Most package test scripts only run `bun test --pass-with-no-tests`.
- `bun run test` passes, but Turbo emits warnings because the configured outputs do not exist.

### 7. Documented environment surface is larger than the live implementation

Severity: Low

File references:
- [.env.example](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/.env.example#L12)
- [packages/ai/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/ai/src/index.ts#L6)
- [packages/rag/src/index.ts](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/packages/rag/src/index.ts#L6)

Details:
- The example env file lists AI provider and R2 configuration as if they are active requirements.
- The current AI package is still a stub and the RAG package returns an empty result set.
- That makes setup look more demanding than the current implementation actually is.

## Testing Gaps

- `packages/config` has no tests covering missing or invalid environment variables.
- There is no root `README` documenting the setup flow in one place.

## Verified Commands

```powershell
bun run check
bun run test
bun --version
node --version
npm --version
```

## Positive Note

- `.gitignore` correctly excludes `.env`, `.env.local`, and `.env.*.local`, so local secret files are not set up to be committed by default.
