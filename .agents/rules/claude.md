---
trigger: model_decision
description: claude models
---
The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## Project Overview
CS is a WhatsApp bot platform powered by AI. It connects to WhatsApp via Baileys, uses pluggable LLM providers (DeepSeek / Gemini / Groq) for conversation, Gemini embeddings (768d) for RAG, Convex as the backend database, Cloudflare R2 for media storage, and Hono for the REST API.

## Architecture
Turborepo monorepo with Bun as the runtime and package manager.

### ApWindows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\Hussein\Desktop\Things\Zerone\Projects\CS> codex

╭────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.106.0)                     │
│                                                │
│ model:     gpt-5.3-codex   /model to change    │
│ directory: ~\Desktop\Things\Zerone\Projects\CS │
╰────────────────────────────────────────────────╯

Tip: New Codex is included in your plan for free through March 2nd – let’s build together.


› Run /review on my current changesps (`apps/`)
| App      | Purpose                  |
| -------- | ------------------------ |
| `api`    | Hono REST API server     |
| `bot`    | WhatsApp bot (Baileys)   |
| `worker` | Background job processor |
| `cli`    | Developer CLI utilities  |

### Packages (`packages/`)
| Package  | Alias        | Purpose                                          |
| -------- | ------------ | ------------------------------------------------ |
| `config` | `@cs/config` | Type-safe env validation (Zod + t3-env)          |
| `core`   | `@cs/core`   | Logger (Pino), error classes, health checks      |
| `shared` | `@cs/shared` | Shared types and interfaces                      |
| `db`     | `@cs/db`     | Convex client and helpers                        |
| `ai`     | `@cs/ai`     | AI provider abstraction (`AIProvider` interface) |
| `rag`    | `@cs/rag`    | Embedding and retrieval logic                    |

### Path Aliases
Defined in `tsconfig.base.json` as `@cs/*`. Always use aliases over relative imports between packages.

## Tech Stack
Bun, TypeScript, Convex, Hono, Baileys, Pino, DeepSeek/Gemini/Groq, Vitest, Oxlint, Prettier, Turborepo

## Commands
Always use `bun` to run scripts from the repo root.

| Command                                  | Description                                       |
| ---------------------------------------- | ------------------------------------------------- |
| `bun dev`                                | Run all workspace dev tasks (parallel, via Turbo) |
| `bun dev:api` / `dev:bot` / `dev:worker` | Run a single app                                  |
| `bun typecheck`                          | Typecheck all workspaces                          |
| `bun lint`                               | Type-aware Oxlint linting                         |
| `bun lint --fix`                         | Auto-fix lint issues                              |
| `bun check`                              | Runs typecheck + lint                             |
| `bun test`                               | Run tests with Vitest                             |
| `bun x vitest run path/to/test.test.ts`  | Run a single test file                            |
| `bun generate`                           | Regenerate Convex types after schema changes      |

**Do not run:** `bun dev` (assume already running), `bun build` (CI only)

## Conventions
- **Modular code** — keep files small and focused, avoid large monolithic modules
- **Use path aliases** (`@cs/*`) instead of deep relative imports
- **Ignore** `node_modules`, `package.json`, `package-lock.json` when searching
- **Keep agent files in sync** — `agents.md` and `claude.md` should always match
- **Add tests** in the relevant workspace when adding behavior
- **Run `bun generate`** after any Convex schema changes

## Project Roadmap
The full roadmap lives in `docs/project_roadmap/` and spans 12 phases from foundation setup through deployment.
