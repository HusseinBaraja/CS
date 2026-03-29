# Logging

## Goals

- Keep one structured logging contract across API, bot, worker, CLI, AI, and RAG code.
- Make logs easy for operators and LLM agents to trace by stable fields first, free-form messages second.
- Keep sensitive content out of logs by default.

## Required Event Fields

Every operational event log should include:

- `event`: stable dot-separated name such as `api.request.completed`
- `runtime`: `api`, `bot`, `worker`, `cli`, `ai`, `rag`, or `core`
- `surface`: boundary or subsystem such as `http`, `router`, `provider`, `outbound`, or `job`
- `outcome`: short terminal or transitional state such as `success`, `failed`, `retrying`, `received`

Common correlation fields:

- `requestId`
- `companyId`
- `conversationId`
- `sessionKey`
- `pendingMessageId`
- `jobName`

Common metrics:

- `durationMs`
- `attempt`
- `statusCode`
- `candidateCount`
- `contextBlockCount`
- `usage`

## Safe And Unsafe Data

Safe to log:

- internal ids
- request correlation ids
- counts, booleans, durations, retry metadata
- provider names and model names
- structured error metadata
- redacted phone and JID values
- text summaries returned by `summarizeTextForLog`

Do not log:

- raw customer messages
- prompt bodies
- model responses
- authentication tokens
- API keys
- full phone numbers
- owner phone numbers

## Error Shape

- Always log serialized errors under `error`
- Never log raw thrown values directly
- Prefer `serializeErrorForLog` so `AppError` context and causes are preserved consistently

## Agent Trace Workflow

To trace a request or message:

1. Filter by `requestId`, `conversationId`, `companyId`, or `sessionKey`
2. Order records by timestamp
3. Follow `event` transitions across runtime boundaries
4. Use `outcome`, `durationMs`, `attempt`, and `error` to identify the failing stage

## Event Naming

- Use dot-separated stable event names
- Use nouns for the subsystem and verbs for the lifecycle point
- Prefer names such as `bot.session.state_changed` or `worker.job.tick_failed`
