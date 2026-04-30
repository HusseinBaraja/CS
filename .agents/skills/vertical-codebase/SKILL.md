---
name: vertical-codebase
description: Guide code organization by vertical functionality instead of horizontal technical type. Use when adding, moving, reviewing, or refactoring application code, especially when deciding where components, hooks, utilities, types, API handlers, Convex functions, tests, or shared packages should live; when reducing scattered feature code; when defining public module boundaries; or when checking whether a change should be colocated with an existing Reda company, conversation, catalog, handoff, runtime, analytics, media, or dashboard vertical.
---

# Vertical Codebase

Use this skill to keep code grouped by what it does, not by what kind of file it is. The source idea is TkDodo's "The Vertical Codebase": colocate code that changes together, avoid dumping unrelated code into broad `components`, `hooks`, `utils`, or `types` buckets, and make cross-vertical dependencies explicit.

## Core Rule

Prefer a vertical home:

```text
feature-or-domain/
  Component.tsx
  query.ts
  schema.ts
  validation.ts
  helpers.ts
  tests...
```

over a horizontal split:

```text
components/
hooks/
utils/
types/
```

Technical type is secondary. Functionality, ownership, and change coupling decide placement.

## Placement Workflow

1. Name what the code does in product terms.
2. Find the closest existing vertical that owns that behavior.
3. Put private helpers, types, tests, query options, validators, and UI next to the code that uses them.
4. Export only what another vertical is allowed to consume.
5. If code is shared by multiple verticals, ask whether it is actually its own vertical.
6. If it is generic product UI, place it in the design-system or existing shared UI boundary.
7. If no vertical exists, create a sibling vertical with a narrow purpose instead of expanding a catch-all file.

## Reda Verticals

Use the project language from `CONTEXT.md`:

- Company: tenant-scoped business data, settings, owner phone, runtime config.
- Tenant: isolation boundary, not a UI/account label.
- Customer: WhatsApp contact.
- Conversation: company-scoped customer message history.
- Handoff: muted conversation plus owner notification and recovery.
- Runtime Session: per-company WhatsApp connection and pairing state.
- Grounded Answer: catalog-backed assistant reply.
- Catalog Import: spreadsheet ingest for company catalog records.

Prefer these names in folders, modules, tests, and comments. Avoid introducing generic names such as account, workspace, client, ticket, or admin when the domain term is known.

## Shared Code Test

Before moving code to a shared package or top-level helper, answer:

- Which verticals use it today?
- Does it encode product behavior from one vertical?
- Could changing it for one vertical break another?
- Is there a stable public interface worth documenting?

If the code mostly serves one vertical, keep it private there. If it serves several verticals with the same meaning, make that concern its own vertical or shared package with explicit exports.

## Boundary Rules

- Treat imports from a vertical's internal files as private unless an index or package export clearly exposes them.
- Prefer `@cs/*` path aliases for cross-package imports.
- Keep tenant isolation, validation, authorization, and grounded data access inside the owning boundary.
- Do not let the dashboard bypass API contracts to reach around tenant or validation rules.
- Do not add unrelated responsibilities to orchestration-heavy or over-limit core files; extract a sibling module.
- Check `modularity-policy.json` before editing core logic over 240 LOC or a `must_split` file.

## Refactor Signals

Use this skill when you see:

- One feature split across `components`, `hooks`, `utils`, and `types`.
- A helper used only by one feature but stored globally.
- A broad file growing new branches for a different concern.
- Tests far from the behavior they verify.
- Deep imports across feature internals.
- Duplicate helpers created because ownership is unclear.

Refactor in small steps. Move the lowest-risk private code first, keep behavior stable, update imports, then run the focused checks required by `AGENTS.md`.

## Review Checklist

For each change, verify:

- The folder name describes what the code does.
- Related UI, data access, validation, types, and tests are colocated where practical.
- Shared exports are deliberate and minimal.
- Reda tenant boundaries remain explicit.
- Arabic-first UX and English support are preserved where user-facing.
- Tests cover the moved or newly colocated behavior.
