# OpenGrep in CSCB

## Purpose in CSCB

OpenGrep is the project-specific static analysis layer for CSCB. It is meant to catch architectural and safety regressions that are not guaranteed to be caught by `bun lint`, `bun typecheck`, or `bun test`.

The initial ruleset focuses on:

- Convex action vs mutation boundaries
- lazy config and environment resolution
- admin client boundary discipline
- unsafe dynamic TypeScript patterns

## What It Checks in This Repo

The root [`opengrep.yml`](opengrep.yml) ruleset currently looks for:

- `eval(...)` and `new Function(...)`
- direct `process.env` reads outside approved boundaries
- `convex/browser` imports outside [`packages/db/src`](packages/db/src)
- `setAdminAuth(...)` outside [`packages/db/src/client.ts`](packages/db/src/client.ts)
- eager `createConvexAdminClient(...)` setup in API module scope
- `fetch(...)` inside Convex mutations
- `generateGeminiEmbeddings(...)` inside Convex mutations
- invalid product embedding writes through `client.mutation(convexInternal.products.*)`

## Local Installation

This repo expects a system `opengrep` binary on `PATH`.

Windows-first setup:

1. Download the current Windows release from the official OpenGrep releases page: <https://github.com/opengrep/opengrep/releases>
2. Put the extracted `opengrep` executable somewhere on `PATH`.
3. Open a new shell and verify:

```powershell
opengrep --version
```

If you are not on Windows, use the equivalent official install method from the OpenGrep project and still verify `opengrep --version` before using the wrapper.

## How to Run It Locally in CSCB

Run the full repo scan from the repository root:

```powershell
bun run opengrep
```

Run only part of the repo:

```powershell
bun run opengrep -- apps/api/src
bun run opengrep -- packages/db/src
bun run opengrep -- convex/products.ts
```

The direct CLI equivalent is:

```powershell
opengrep scan --config opengrep.yml apps packages convex
```

## When to Run It

Run OpenGrep before opening or updating a PR that changes:

- `apps/**`
- `packages/**`
- `convex/**`

Run it immediately after editing any of these areas:

- API service factories
- Convex action or mutation code
- environment or config loading
- database or storage client boundaries

Docs-only changes usually do not need OpenGrep unless they also touch [`opengrep.yml`](opengrep.yml), [`.coderabbit.yaml`](.coderabbit.yaml), or this guide.

## CodeRabbit PR Behavior

CodeRabbit reads the root [`.coderabbit.yaml`](.coderabbit.yaml) file during PR review. That configuration enables the OpenGrep tool, and CodeRabbit then uses the repo’s root [`opengrep.yml`](opengrep.yml) ruleset when reviewing pull requests.

Use the local command before pushing to reduce avoidable PR review churn:

```powershell
bun run opengrep
```

## How to Interpret Findings

- `ERROR` means a high-confidence architectural violation that should normally be fixed before review.
- `WARNING` means a broader hygiene or safety concern that still needs deliberate review.

If you must suppress a finding, keep the suppression narrow and add a short justification. Do not disable the full config for convenience.

## Relationship to Existing Checks

OpenGrep complements the existing required checks:

- `bun lint`
- `bun typecheck`
- `bun test`

It does not replace them. In this first rollout it is advisory, which means it is available locally and in CodeRabbit review, but it is not yet part of `bun check` or `bun ci`.
