# AGENTS.md

## Instruction Priority

- Every instruction in this file is mandatory.
- Use `.agents/skills/caveman/SKILL.md` in lite mode.
- Use `.agents/skills/vertical-codebase/SKILL.md` to decide how to structure the codebase.
- Commit incrementally when you complete a checkpoint.
- Follow the existing non-destructive git rules: never revert user changes unless explicitly asked.

## Required Reading

- Read `docs/PROJECT_CHARTER_AND_VISION.md`.
- Read `docs/SRS.md`.
- Read `CONTEXT.md`.

## Project Snapshot

Reda (رضا) is a multi-tenant WhatsApp customer service platform for small and mid-size businesses. It helps each company answer customer questions in Arabic and English, share product catalogs and images, hand off conversations to a human when needed, and keep customer data, conversation history, analytics, and business settings isolated per tenant. The product is built to reduce repetitive support work while keeping answers grounded in real catalog data.


## Product Invariants

- Arabic UX is primary; English support remains required.
- The dashboard must use API contracts and must not bypass tenant, validation, or authorization rules.
- Keep responses and architecture grounded in real stored data.

## Command Rules

- Run all repo scripts from the repository root with `bun`.
- Do not run `bun dev`; it is always running.
- Use `bun test` or the nearest focused script for the specific aspect modified, e.g. `bun test:convex` for Convex changes.
- Run `bun generate` after any Convex schema change.

## Completion Gates

- Documentation-only changes: no repo check is required unless generated docs, scripts, or typed examples changed.
- General code tasks: targeted tests, `bun lint`, and `bun check` must pass before completion.
- Convex schema changes: run `bun generate`, `bun test:convex`, `bun lint`, and `bun check`.
- Root script or policy changes: run the relevant focused test plus `bun run check:root`.
- If a required check fails, fix it or report the exact failure and why it remains.

## Testing Discipline

- Follow test-driven development when making code changes: add or update tests as you go.
- Keep tests focused on the behavior changed.
- Broaden tests when touching shared behavior, cross-package contracts, tenant isolation, recovery flows, or customer-visible replies.

## PR Review Fixes

- When fixing PR issues submitted by CodeRabbit, apply minimal fixes and do not go overboard.
- Minimal change does not mean taking shortcuts; if the correct fix is more involved, make the correct fix.

## Git Workflow

- Never commit to main. If the project is checked out to main and the user asks for a task, create a new branch and do the work in there.
- If the user explicitly says no branch is needed, do not create one.
- Commit incrementally when a logical checkpoint is complete.
- Close all PowerShell/CMD instances you created during the session after you are done working and the codebase is clean and committed.

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
- Use `skills/caveman-commit/SKILL.md` to draft commit messages, then keep the final message Conventional Commits compliant.
- Preserve the existing non-destructive git rules in this file when handling commit requests.

## Core Priorities

- Correctness and reliability first.
- Prefer small, focused modules over large monolithic systems.
- Avoid architecture that encourages hallucinated, stale, cross-tenant, or partial state.

## Maintainability

- Long-term maintainability is a core requirement.
- Extract shared logic instead of duplicating behavior across apps or packages.
- Do not hesitate to refactor existing code when that produces a cleaner system.
- Use the `@cs/*` path aliases from `tsconfig.base.json` for cross-package imports.

## Modularity Guardrails

- Keep code modular and do not let core logic `.ts` files exceed `240` LOC; extract sibling modules before files grow too large.

## Final Response Requirements

- State the files changed.
- State the tests and checks run.
- State any required checks skipped and why.
