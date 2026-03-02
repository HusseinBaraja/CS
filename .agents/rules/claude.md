---
trigger: model_decision
description: claude models
---

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## Build/Test Commands

Always use `bun` to run scripts.

- `- bun dev` – Start development server
  **[Note: Don't use this unless otherwise told to]**
- `- bun lint` – Type-aware Oxlint linting (also reports TypeScript errors)
- `- bun lint --fix` – Apply fixes for autofixable lint issues
- `- bun check` – Runs format & lint
- `- bun test` – Run tests with Vitest (excludes evals)
- `- bun test:watch` – Watch mode for tests
- `- bun x vitest run path/to/test.test.ts` – Run single test file
- `- bun generate` – Generate Convex types after schema changes

## Monorepo Commands

Run these from repo root:

- `bun dev` - Run all workspace dev tasks via Turbo.
- `bun dev:api` / `bun dev:bot` / `bun dev:worker` - Run one app only.
- `bun typecheck` - Typecheck all workspaces in dependency order.
- `bun build` - Build all workspaces with Turbo graph orchestration.
- `bun check` - Run workspace quality checks.
- `bun ci` - Full pipeline (check + test + build).

**Do not run:** `bun dev` (assume already running), `bun build` (CI only)

## Tech Stack

Bun, TypeScript, Convex, Hono, Baileys, Pino, DeepSeek/Gemini/Groq (pluggable via `AIProvider` interface), Gemini Embeddings (768d), Vitest, Oxlint, Prettier, Turborepo

## Future LLM Handoff Notes

- This repository is currently a bootstrap skeleton. Most `src/index.ts` files are minimal stubs; expect to implement features, not just wire existing modules.
- Primary app entrypoints:
  - `apps/api/src/index.ts` (Hono server, `/api/health`)
  - `apps/bot/src/index.ts` (mock chat bootstrap)
  - `apps/worker/src/index.ts` (DB bootstrap log)
  - `apps/cli/src/index.ts` (CLI bootstrap log)
- Shared package entrypoints:
  - `packages/config/src/index.ts` (typed env with defaults: `NODE_ENV`, `API_PORT`)
  - `packages/core/src/index.ts` (Pino logger + health helper)
  - `packages/db/src/index.ts` (Convex connection shape, reads `CONVEX_URL`)
  - `packages/ai/src/index.ts` (mock provider return)
  - `packages/rag/src/index.ts` and `packages/shared/src/index.ts` (basic types/stubs)
- Path aliases are defined in `tsconfig.base.json` (`@cs/*`). Prefer using aliases instead of deep relative imports.
- Convex schema is currently placeholder-only at `convex/schema.ts`; after real schema edits, run `bun generate` (mapped to `turbo run generate`, with `packages/db` running `bunx convex codegen`).
- There are currently no test files in the repo (`*.test.*` / `*.spec.*` absent). If you add behavior, add tests in the relevant workspace.
- Avoid searching or editing under `node_modules`; use `rg --files -g '!**/node_modules/**'` when indexing files.
- Keep `.agents/rules/agents.md` and `.agents/rules/claude.md` synchronized when adding project-specific agent guidance.
