# AGENTS.md

## Instruction Priority

- Every instruction in this file is mandatory.
- Use `skills/caveman/SKILL.md` in lite mode

## Task Completion Requirements

- Run all repo scripts from the repository root with `bun`.
- `bun check` must pass before considering general code tasks complete.
- Follow test-driven development when making code changes: add or update tests as you go.
- Use `bun test` for the spesfic aspect you modified, e.g: `bun test:convex` for Convex changes.
- Run `bun generate` after any Convex schema change.
- Run `bun dev` to test if there are no issues with the dev environment unless spesfied otherwise.
- Run `bun lint`.

## Random
- When fixing PR issues that were submitted by code rabbit, apply minimal fixes and don't go overboard. The goal is to just fix the issues.
- Never commit to main. If the project is checked out to main and the user asks for a task, create a new branch and do the work in there.
- Close all powershell/CMD instances after you are done working and the codebase is clean and commited.

## Large Task Workflow

- Split large tasks into logical steps and commit regularly.
- On large plan implementations, do not begin the next logical step until the current step has:
  1. its code changes finished,
  2. the required repo-root `bun` commands run,
  3. failures fixed or explicitly reported,
  4. a commit created for that step.
- Do not batch multiple logical steps into one uncommitted work block.


## Commit Message Skill

- Follow the `conventional-commit` skill workflow instead of inventing a commit message ad hoc.
- use `skills/caveman-commit/SKILL.md` to draft commit messages, then keep the final message Conventional Commits compliant.
- Preserve the existing non-destructive git rules in this file when handling commit requests.

## Project Snapshot

CSCB is a Bun-first, strict TypeScript monorepo for multi-tenant WhatsApp support. It ships a Hono REST API, a Node/Baileys bot, a Convex backend for catalogs, conversations, analytics, and vector search, AI orchestration with DeepSeek/Gemini/Groq plus Gemini embeddings, R2-backed media storage, a Bun CLI for seed/backup, a worker for auto-resume/handoff/media cleanup, and a React/Vite marketing site. Tenants isolate catalogs, products, variants, offers, currency rates, runtime state, and bilingual Arabic/English replies.

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

## Required Reading

- Read `docs/PROJECT_CHARTER_AND_VISION.md`.
- Read `docs/SRS.md`.

