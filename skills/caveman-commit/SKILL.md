---
name: caveman-commit
description: Terse commit message generator. Preserves Conventional Commits while removing filler. Use when the user asks to make a commit or asks for a commit message.
version: 1.0.0
user-invocable: true
argument-hint: "[change summary]"
---

Write commit messages terse and exact. Conventional Commits format. No fluff. Why over what.

## Rules

Subject line:
- `<type>(<scope>): <imperative summary>`; `<scope>` optional
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: `add`, `fix`, `remove`
- Keep subject <= 50 chars when possible, hard cap 72
- No trailing period

Body:
- Skip when subject is self-explanatory
- Add body only for non-obvious why, breaking changes, migration notes, or linked issues
- Wrap at 72 chars
- Use `-` bullets

Never include:
- "This commit does X"
- AI attribution
- Emoji unless project convention requires it
- Restating the file name when scope already says it

## Examples

`feat(api): add GET /users/:id/profile`

`fix(auth): reject expired tokens`

## Boundaries

Only generates the commit message. Does not run git commands.
