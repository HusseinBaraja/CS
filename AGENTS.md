# AGENTS.md

## Task Completion Requirements

- Run all repo scripts from the repository root with `bun`.
- `bun check` must pass before considering general code tasks complete.
- Follow test-driven development when making code changes: add or update tests as you go.
- Use `bun test` when tests are needed.
- Use `bun test:convex` for Convex-specific test work.
- Run `bun generate` after any Convex schema change.
- Do not run `bun dev` (assume it is already running).


## Commit Message Skill

- Follow the `conventional-commit` skill workflow instead of inventing a commit message ad hoc.
- Preserve the existing non-destructive git rules in this file when handling commit requests.

## Project Snapshot

CSCB is an early-stage multi-tenant WhatsApp customer service platform for small and mid-size businesses. It combines a Hono REST API, a Baileys WhatsApp bot, Convex-backed data and vector search, and low-cost AI provider orchestration to answer product questions in Arabic and English, send catalogs and images, support human handoff, and track analytics.

## Core Priorities

- Correctness and reliability first.
- Keep responses grounded in real data; avoid architecture that encourages hallucinated or partial state.
- Prefer small, focused modular programming techniques over large monolithic systems.
- When planning a step in the roadmap, split it to distinct mini-steps, run required bun commands at the end of each mini-step, then commit each one separately

## Maintainability

- Long-term maintainability is a core requirement.
- Extract shared logic instead of duplicating behavior across apps or packages.
- Do not hesitate to refactor existing code when that produces a cleaner system.
- Use the `@cs/*` path aliases from `tsconfig.base.json` for cross-package imports.
- If you encounter something surprising, tell the developer and add it to this file so future agents do not repeat the same mistake.

## Required Reading

- Read `docs/PROJECT_CHARTER_AND_VISION.md`.
- Read `docs/SRS.md`.

