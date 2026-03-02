---
trigger: model_decision
description: cluade models
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

**Do not run:** `bun dev` (assume already running), `bun build` (CI only)

## Tech Stack

Bun, TypeScript, Convex, Hono, Baileys, Pino, DeepSeek/Gemini/Groq (pluggable via `AIProvider` interface), Gemini Embeddings (768d), Vitest, Oxlint, Prettier, Turborepo
