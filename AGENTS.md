# AGENTS.md

## Task Completion Requirements

- Run all repo scripts from the repository root with `bun`.
- `bun lint` and `bun typecheck` must pass before considering code tasks complete.
- Follow test-driven development when making code changes: add or update tests as you go.
- Use `bun test` for the Vitest workspace test run when tests are needed.
- Run `bun generate` after any Convex schema change.
- Do not run `bun dev` (assume it is already running).
- Do not run `bun build` (CI only).
- Suggest a commit message at the end of large changes.

## Project Snapshot

CSCB is a very early-stage multi-tenant WhatsApp customer service platform for small and mid-size businesses. It combines a Hono REST API, a Baileys WhatsApp bot, Convex-backed data and vector search, and low-cost AI provider orchestration to answer product questions in Arabic and English, send catalogs and images, support human handoff, and track analytics.

The roadmap in `docs/project_roadmap` was written before the current codebase existed. Treat it as intent, not as an exact description of what should be built today.

## Core Priorities

- Correctness and reliability first.
- Keep tenant isolation strict and behavior predictable during failures or restarts.
- Keep responses grounded in real data; avoid architecture that encourages hallucinated or partial state.
- Preserve low operational cost without trading away robustness.
- Prefer small, focused modular programming techniques over large monolithic systems.

## Maintainability

- Long-term maintainability is a core requirement.
- Extract shared logic instead of duplicating behavior across apps or packages.
- Do not hesitate to refactor existing code when that produces a cleaner system.
- Use the `@cs/*` path aliases from `tsconfig.base.json` for cross-package imports.
- If you encounter something surprising, tell the developer and add it to this file so future agents do not repeat the same mistake.

## Required Reading

- Read `docs/PROJECT_CHARTER_AND_VISION.md`.
- Read `docs/SRS.md`.
- When working from the roadmap, align the implementation with the current codebase and the documents above rather than following stale steps literally.

## Workspace Roles

- `apps/api`: Hono REST API for CRUD, auth, validation, health checks, and service orchestration.
- `apps/bot`: Baileys-based WhatsApp bot runtime.
- `apps/worker`: Background job and asynchronous processing entrypoint.
- `apps/cli`: Developer utilities such as seed and backup workflows.
- `packages/ai`: Shared AI provider abstractions and related logic.
- `packages/config`: Shared configuration helpers and validation.
- `packages/convex-api`: Shared Convex-facing API helpers/types.
- `packages/core`: Core domain logic intended to stay framework-light.
- `packages/db`: Shared database client utilities.
- `packages/rag`: Shared retrieval and RAG-related logic.
- `packages/shared`: Cross-cutting shared utilities.
- `convex`: Convex schema, functions, seeds, and tests.

## Working Rules

- Keep code modular and files focused.
- Prefer extending existing shared packages over app-local duplication.
- Preserve strict type safety and existing test coverage expectations.
- After schema-affecting Convex changes, regenerate code before finishing.

## Known Pitfalls

- `createApp()` is instantiated directly in API tests without `CONVEX_URL` set. Any default service you wire into `apps/api/src/app.ts` must resolve Convex configuration lazily inside request-time methods, not during app construction, or unrelated health/auth tests will start failing early.
- on the current Convex version in this repo, `ctx.vectorSearch(...).filter(...)` supports `q.eq(...)` and `q.or(...)`, but not multi-field `AND`. If you need exact ANN filtering across multiple dimensions like `companyId + language`, add a combined filter field such as `companyLanguage` and register that as the vector index `filterField`.
- on Convex `1.32.0` in this repo there is no schema-level unique index or constraint API for `defineTable(...)`. If you need singleton semantics, enforce them with a narrow indexed query inside a mutation plus an explicit lock or lease document, rather than assuming `.index(...)` can guarantee uniqueness.
- real product embedding regeneration in this repo cannot live inside a plain Convex mutation. Because Gemini embedding generation is an external API call, product create and update need an action that generates embeddings first and then hands the writes to an internal mutation so failed embeddings do not leave partial product state behind.
