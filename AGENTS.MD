The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

Note: The road map was created before anything was built, so it has not been updated to reflect the current state of the project. If you see something that doesn't make sense, take the general idea from the road map and make it withing the new constraints of the current codebase.
Note: Suggest a commit message at the end of large changes.

## Project Overview
Read docs/PROJECT_CHARTER_AND_VISION.md, and docs/SRS.md

## Architecture
Turborepo monorepo with Bun as the runtime and package manager.

| App      | Purpose                  |     |
| -------- | ------------------------ | --- |
| `api`    | Hono REST API server     |     |
| `bot`    | WhatsApp bot (Baileys)   |     |
| `worker` | Background job processor |     |
| `cli`    | Developer CLI utilities  |     |

### Path Aliases
Defined in `tsconfig.base.json` as `@cs/*`. Always use aliases over relative imports between packages.

**Do not run:** `bun dev` (assume already running), `bun build` (CI only)

## MUST do
- **Modular code** — keep files small and focused, avoid large monolithic modules
- **Run `bun generate`** after any Convex schema changes
- Always use `bun` to run scripts from the repo root after making changes.

| Command                                  | Description                                       |
| ---------------------------------------- | ------------------------------------------------- |
| `bun typecheck`                          | Typecheck all workspaces                          |
| `bun lint`                               | Type-aware Oxlint linting                         |
| `bun lint --fix`                         | Auto-fix lint issues                              |
| `bun check`                              | Runs typecheck + lint                             |
| `bun test`                               | Run tests with Vitest                             |

- When doing a step from the project roadmap, make sure to read @cs/SRS.md and @cs/PROJECT_CHARTER_AND_VISION.md to understand the project's goals and how to approach the problem.

## Known Pitfalls
- Surprise: roadmap `docs/project_roadmap/Phase 3/step_3.1.md` is stale relative to the repo. `apps/api` already exists with `src/index.ts`, `src/app.ts`, and health/readiness tests, so treat Step 3.1 as a gap-analysis and completion task for missing middleware/bootstrap pieces rather than recreating the Hono server from scratch.
- Surprise: `createApp()` is instantiated directly in API tests without `CONVEX_URL` set. Any default service you wire into `apps/api/src/app.ts` must resolve Convex configuration lazily inside request-time methods, not during app construction, or unrelated health/auth tests will start failing early.
- Surprise: on the current Convex version in this repo, `ctx.vectorSearch(...).filter(...)` supports `q.eq(...)` and `q.or(...)`, but not multi-field `AND`. If you need exact ANN filtering across multiple dimensions like `companyId + language`, add a combined filter field such as `companyLanguage` and register that as the vector index `filterField`.
- Surprise: for full Convex backups in this repo, use Convex Dashboard snapshots or the CLI `convex export` / `convex import` flow. There is not a separate app-level snapshot export API wired into the codebase here, and the Convex CLI defaults to the dev deployment unless you pass an explicit selector such as `--prod`, `--deployment-name`, `--preview-name`, or `--env-file`.
- Surprise: on Convex `1.32.0` in this repo there is no schema-level unique index/constraint API for `defineTable(...)`. If you need singleton semantics, enforce them with a narrow indexed query inside a mutation plus an explicit lock/lease document, rather than assuming `.index(...)` can guarantee uniqueness.
