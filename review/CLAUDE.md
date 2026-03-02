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

**Do not run:** `bun dev` (assume already running), `bun build` (CI only)

## Key References

- **Architecture:** `docs/system_design.md`
- **API Spec:** `docs/api_spec.json` (OpenAPI 3.1)
- **Source of Truth:** `docs/SOURCE_OF_TRUTH.md`

## Rules

- **Bun only** — no npm/pnpm/yarn
- **TypeScript strict** — type safety is top priority
- **Modular code** — small files, clear boundaries, no monoliths
- **TDD** — write tests alongside every feature using `bun test`
- **Business-agnostic** — no company-specific logic
- **Multi-tenant** — all DB queries scoped by `company_id`
- **No external SaaS** — everything runs locally

## Tech Stack

Bun, TypeScript, Convex, Hono, Baileys, Pino, DeepSeek/Gemini/Groq (pluggable via `AIProvider` interface), Gemini Embeddings (768d), Vitest, Oxlint, Prettier, Turborepo

## Folder Convention

```
src/config/      — env, database, constants
src/providers/   — AI provider implementations
src/services/    — core business logic (whatsapp/, ai/, rag/)
src/controllers/ — message + command handlers
src/commands/    — individual ! commands
src/api/         — Hono server, middleware, routes
src/db/          — Drizzle schema, seed, backup
src/utils/       — logger, errors, language, currency
```

## Commits

Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
