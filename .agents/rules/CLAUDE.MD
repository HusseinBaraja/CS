---
trigger: always_on
---

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

## Commands

Always use `bun` to run scripts from the repo root.

| Command                                  | Description                                       |     |
| ---------------------------------------- | ------------------------------------------------- | --- |
| `bun dev`                                | Run all workspace dev tasks (parallel, via Turbo) |     |
| `bun dev:api` / `dev:bot` / `dev:worker` | Run a single app                                  |     |
| `bun typecheck`                          | Typecheck all workspaces                          |     |
| `bun lint`                               | Type-aware Oxlint linting                         |     |
| `bun lint --fix`                         | Auto-fix lint issues                              |     |
| `bun check`                              | Runs typecheck + lint                             |     |
| `bun test`                               | Run tests with Vitest                             |     |
| `bun x vitest run path/to/test.test.ts`  | Run a single test file                            |     |
| `bun generate`                           | Regenerate Convex types after schema changes      |     |

**Do not run:** `bun dev` (assume already running), `bun build` (CI only)

## Conventions

- **Modular code** — keep files small and focused, avoid large monolithic modules
- **Use path aliases** (`@cs/*`) instead of deep relative imports
- Follow test driven development conventin, test as you go
- **Run `bun generate`** after any Convex schema changes
