# AGENTS.md

## Instruction Priority

- Every instruction in this file is mandatory.
- Treat this file as a required execution checklist, not as optional background context.


## Task Completion Requirements

- Run all repo scripts from the repository root with `bun`.
- `bun check` must pass before considering general code tasks complete.
- Follow test-driven development when making code changes: add or update tests as you go.
- Use `bun test` when tests are needed.
- Use `bun test:convex` for Convex-specific test work.
- Run `bun generate` after any Convex schema change.
- Run `bun dev`.
- On large plan implementations, make a commit after finishing each logical step to avoid large commits that are hard to review.
- On large plan implementations, do not begin the next logical step until the current step has:
    1. its code changes finished,
    2. the required repo-root `bun` commands run,
    3. failures fixed or explicitly reported,
    4. a commit created for that step.
- Do not batch multiple logical steps into one uncommitted work block.
- When fixing PR issues that were submitted by coderabbit, apply minimal fixes and don't go overboard. The goal is to just fix the issues.
- For pr review Fixes, fix each comment in its own commit and resolve the comment on github after commiting. at the end, push the changes to the branch.

## Large Task Workflow

- For any roadmap step or other multi-file implementation, split the work into explicit mini-steps before editing.
- Each mini-step must be small enough to review independently.
- After each mini-step, run the applicable repo-root `bun` commands before committing.
- Create a commit after each completed mini-step, not only at the end of the whole feature.
- If a mini-step cannot be validated yet, stop and tell the developer instead of continuing into the next mini-step.
- If you realize mid-task that you skipped this workflow, stop, report it, and do not continue piling on more changes.


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
- Convex runtime files must not import the broad `@cs/ai` barrel. Convex codegen traverses that barrel into `@cs/core`'s Node-only log stream and `bun generate` fails. In Convex runtime code, import the specific `packages/ai/src/*` module you need instead.
- Convex package typecheck uses `convex/tsconfig.json`, not just `tsconfig.base.json`. When adding a safe Convex `@cs/ai/*` subpath alias, mirror it in `convex/tsconfig.json` or `bun check` will fail in `@cs/convex`.
- Do not make seed-only env vars globally required in `packages/config/src/index.ts`. Convex push/codegen evaluates modules in an environment that may not provide them, and `bun generate` can fail. Keep variables like `SEED_OWNER_PHONE` optional in shared config and enforce them at the CLI command boundary with `requireEnv`.
- Bun `--watch` started inside `apps/api` or `apps/worker` will not watch sibling workspace imports under `packages/*` or `convex/_generated`. Keep those dev scripts running Bun with the repo root as `--cwd` so shared-package edits restart the process.
- In this repository, agent tool timeouts against `bun dev` or `bun x` can leave child Bun processes running in the background. Before retrying those commands, check active `bun.exe` processes to avoid stacking duplicate watchers/installers.
- In the current local environment, `bun dev` may still bring up `api`, `bot`, and `web` while `worker:dev` exits early with code `1`. Treat that as a separate worker startup problem, not as evidence that unrelated changes broke the retrieval or bot flow.
- Baileys may log `Timeout in AwaitingInitialSync, forcing state to Online and flushing buffer` during startup. If the bot still reaches `state: "open"` and stays healthy, treat it as a tolerated upstream sync-timing warning and do not suppress it with brittle log filtering. Escalate only if it repeats frequently or is followed by reconnect churn, failed state transitions, missing history-dependent behavior, or disconnect errors. The later `conflict type="replaced"` session error is a separate problem.
- If you encounter something surprising, tell the developer and add it to this file so future agents do not repeat the same mistake.

## Required Reading

- Read `docs/PROJECT_CHARTER_AND_VISION.md`.
- Read `docs/SRS.md`.

