The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

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
- Surprise: on the current Convex version in this repo, `ctx.vectorSearch(...).filter(...)` supports `q.eq(...)` and `q.or(...)`, but not multi-field `AND`. If you need exact ANN filtering across multiple dimensions like `companyId + language`, add a combined filter field such as `companyLanguage` and register that as the vector index `filterField`.
- Surprise: for full Convex backups in this repo, use Convex Dashboard snapshots or the CLI `convex export` / `convex import` flow. There is not a separate app-level snapshot export API wired into the codebase here, and the Convex CLI defaults to the dev deployment unless you pass an explicit selector such as `--prod`, `--deployment-name`, `--preview-name`, or `--env-file`.
