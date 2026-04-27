# AGENTS.md

## Instruction Priority

- Every instruction in this file is mandatory.
- Use `skills/caveman/SKILL.md` in lite mode
- Commit incrementally when you complete a checkpoint.

## Task Completion Requirements

- Run all repo scripts from the repository root with `bun`.
- `bun check` must pass before considering general code tasks complete.
- Follow test-driven development when making code changes: add or update tests as you go.
- Use `bun test` for the specific aspect you modified, e.g: `bun test:convex` for Convex changes.
- Run `bun generate` after any Convex schema change.
- Don't Run `bun dev` it is always running.
- Run `bun lint`.
- Commands list:
  - `bun run check:modularity`
  - `bun run check:root`

## Random
- When fixing PR issues that were submitted by code rabbit, apply minimal fixes and don't go overboard. The goal is to just fix the issues. Minimal change doesn't mean taking shortcuts, if a fix requires a more complex change, that's fine.
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

Reda (رضا) is a multi-tenant WhatsApp customer service platform for small and mid-size businesses. It helps each business answer customer questions in Arabic and English, share product catalogs and images, hand off conversations to a human when needed, and keep customer data, conversation history, analytics, and business settings isolated per tenant. The product is built to reduce repetitive support work while keeping answers grounded in real catalog data.

## Core Priorities

- Correctness and reliability first.
- Keep responses grounded in real data; avoid architecture that encourages hallucinated or partial state.
- Prefer small, focused modular programming techniques over large monolithic systems. (Ultra important)

## Maintainability

- Long-term maintainability is a core requirement.
- Extract shared logic instead of duplicating behavior across apps or packages.
- Do not hesitate to refactor existing code when that produces a cleaner system.
- Use the `@cs/*` path aliases from `tsconfig.base.json` for cross-package imports.

## Modularity Guardrails

- For core logic `.ts` files, do not add a new responsibility to an existing file when it should be a sibling module.
- No new core logic `.ts` file may exceed `240` LOC without an explicit entry in `modularity-policy.json`.
- If a core logic file already exceeds `240` LOC, it must not grow unless its `modularity-policy.json` entry is intentionally updated with rationale.
- Files classified as `must_split` in `modularity-policy.json` are debt containers: patches are allowed, but adding unrelated responsibilities is not.
- Any `modularity-policy.json` exception change requires:
  1. updated rationale in the policy entry,
  2. updated checker behavior/tests when applicable,
  3. explicit acknowledgment in the change description that the exception is intentional.
- Prefer extracting helper modules before adding new branches to orchestration-heavy files.

## Required Reading

- Read `docs/PROJECT_CHARTER_AND_VISION.md`.
- Read `docs/SRS.md`.

