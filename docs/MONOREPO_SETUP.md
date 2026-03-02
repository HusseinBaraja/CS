# CSCB Monorepo Setup

This repository is now initialized as a Bun + Turborepo monorepo.

## Workspace Layout

```
CS/
  apps/
    api/      # Hono REST runtime
    bot/      # WhatsApp runtime
    worker/   # Background jobs / cleanup tasks
    cli/      # Admin and maintenance commands
  packages/
    config/   # Typed env contract
    shared/   # Shared types and constants
    core/     # Logging, errors, core services
    db/       # Convex adapters and db-facing contracts
    ai/       # AI provider interfaces and orchestration
    rag/      # Embeddings, vector search, context building
  convex/     # Convex schema/functions/codegen target
  turbo.json
  tsconfig.base.json
  tsconfig.json
  package.json
```

## Root Commands

- `bun dev` runs all `dev` tasks through Turbo.
- `bun dev:api` runs only the API app.
- `bun dev:bot` runs only the bot app.
- `bun dev:worker` runs only the worker app.
- `bun build` runs graph-aware builds.
- `bun typecheck` runs graph-aware type checks.
- `bun check` runs graph-aware quality checks.
- `bun ci` runs check + test + build via Turbo.

## Internal Package Rules

- Apps may import from packages.
- Packages may import from other packages only when needed.
- Apps must not import from other apps.
- Keep cross-cutting contracts in `packages/shared`.

## Path Mapping for Existing Plan

The existing implementation docs use single-app paths like `src/services/...`.
Use this mapping during implementation:

- `src/config/*` -> `packages/config/src/*`
- `src/utils/*` -> `packages/core/src/*`
- `src/providers/*` -> `packages/ai/src/*`
- `src/services/rag/*` -> `packages/rag/src/*`
- `src/services/ai/*` -> `packages/ai/src/*`
- `src/services/whatsapp/*` -> `apps/bot/src/*` (runtime wiring) and `packages/core/src/*` (shared logic)
- `src/api/*` -> `apps/api/src/*`
- `src/controllers/*` -> `apps/bot/src/*` or `apps/api/src/*` based on runtime
- `src/commands/*` -> `apps/cli/src/*` for reusable command handlers and `apps/bot/src/*` for WhatsApp command routing
- `convex/*` remains at repo root `convex/*`

## Standard Workspace Scripts

Each workspace should keep this baseline:

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "check": "bun run typecheck && bun run lint",
    "test": "bun test"
  }
}
```

## Next Refactor Order

1. Implement foundational shared modules in `packages/config`, `packages/shared`, `packages/core`.
2. Implement Convex schema/functions in `convex/` and adapters in `packages/db`.
3. Move AI and RAG layers into `packages/ai` and `packages/rag`.
4. Build Hono API routes in `apps/api`.
5. Build WhatsApp runtime/session flow in `apps/bot`.
6. Add background cron and cleanup workers in `apps/worker`.
7. Add operational scripts in `apps/cli`.
