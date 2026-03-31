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
- text summaries returned by `summarizeTextForLog` such as length and line count only

Do not log:

- raw customer messages
- prompt bodies
- model responses
- authentication tokens
- API keys
- full phone numbers
- owner phone numbers

## Step 0 Conversational Intelligence Diagnostics

Step 0 adds normalized conversational-intelligence events as an additive guardrail layer only. These events must not change retrieval order, prompt content, fallback wording, or persistence behavior. Existing RAG and provider events remain in place for backward compatibility.

Step 0 event safety rules:

- `rag.context_usage.recorded` may log `conversationId`, `requestId`, `stage`, prompt-history selection mode, and boolean context-source flags only
- `rag.retrieval.outcome_recorded` may log `conversationId`, `requestId`, retrieval mode, retrieval outcome, counts, top score, fallback choice, and summarized query metrics from `summarizeTextForLog` only
- `rag.decision.recorded` may log `conversationId`, `requestId`, decision type, reason, preceding stage, `resolutionConfidence`, retrieval outcome, and provider outcome only
- `rag.structured_output.failure_recorded` may log `conversationId`, `requestId`, provider name, model name, failure kind, repair-attempt flag, and fallback choice only
- None of the Step 0 events may log raw customer text, prompt bodies, or model output text

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

For a WhatsApp customer message, the normal path is:

1. `bot.router.inbound_persisted`
2. `rag.retrieval.completed`
3. `rag.retrieval.outcome_recorded`
4. `rag.context_usage.recorded`
5. `ai.provider.*`
6. `rag.decision.recorded` when a fallback, clarify, or handoff path is taken
7. `bot.router.assistant_pending_created`
8. `bot.outbound.sequence_completed`
9. `bot.router.assistant_committed`

If a path hands off or fails, keep the same `requestId` and inspect the first event whose `outcome` becomes `failed`, `retrying`, `provider_failure_fallback`, or `invalid_model_output_fallback`.

## Event Naming

- Use dot-separated stable event names
- Use nouns for the subsystem and verbs for the lifecycle point
- Prefer names such as `bot.session.state_changed` or `worker.job.tick_failed`

## Event Catalog

| Runtime | Surface | Event | Outcome examples | Notes |
| --- | --- | --- | --- | --- |
| `api` | `http` | `api.request.completed` | `success`, `client_error`, `error`, `rate_limited` | Terminal request summary with `requestId`, `statusCode`, and `durationMs` |
| `api` | `http` | `api.request.validation_failed` | `invalid` | Validation and malformed JSON failures |
| `bot` | `session` | `bot.session.state_changed` | `initializing`, `connecting`, `awaiting_pairing`, `open`, `reconnecting`, `failed` | Session lifecycle tracing |
| `bot` | `session` | `bot.session.reconnect_scheduled` | `scheduled` | Reconnect backoff planning |
| `bot` | `runtime` | `bot.runtime.startup_failed` | `failed` | Bot application startup failed before the tenant session manager came up |
| `bot` | `router` | `bot.router.inbound_persisted` | `accepted`, `duplicate`, `muted` | Customer inbound persistence milestone |
| `bot` | `router` | `bot.router.orchestration_failed` | `error` | Router-level failure before assistant send |
| `bot` | `router` | `bot.router.assistant_pending_created` | `pending` | Assistant reply queued for delivery |
| `bot` | `outbound` | `bot.outbound.sequence_completed` | `success` | Outbound send success with `durationMs` |
| `bot` | `outbound` | `bot.outbound.sequence_failed` | `failed` | Outbound send failure with serialized `error` |
| `rag` | `retrieval` | `rag.retrieval.completed` | `grounded`, `empty`, `low_signal` | Retrieval summary with query metadata only |
| `rag` | `retrieval` | `rag.retrieval.outcome_recorded` | `recorded` | Normalized Step 0 retrieval event with counts, top score, fallback choice, and summarized query metrics only |
| `rag` | `orchestrator` | `rag.context_usage.recorded` | `recorded` | Step 0 context-source provenance with booleans and prompt-history selection metadata only |
| `rag` | `orchestrator` | `rag.decision.recorded` | `recorded` | Normalized clarify, fallback, and handoff decision event |
| `rag` | `orchestrator` | `rag.structured_output.failure_recorded` | `recorded` | Structured-output failure taxonomy with provider and failure metadata only |
| `rag` | `orchestrator` | `rag.catalog_chat.provider_fallback` | `provider_failure_fallback` | Provider chain failed and RAG returned a safe handoff fallback |
| `rag` | `orchestrator` | `rag.catalog_chat.parse_failed` | `invalid_model_output_fallback` | Model output could not be parsed; logs metadata only |
| `ai` | `chat` | `ai.provider.request_completed` | `success` | Final provider success with `usage` and `durationMs` |
| `ai` | `chat` | `ai.provider.attempt_failed` | `retrying`, `failed` | Single provider attempt failure |
| `ai` | `chat` | `ai.provider.failover` | `failover` | Next provider selected |
| `ai` | `chat` | `ai.provider.chain_failed` | `do_not_retry`, `provider_chain_exhausted` | Terminal provider chain failure |
| `ai` | `probe` | `ai.provider.probe_completed` | `healthy`, `degraded` | Startup or diagnostics probe summary |
| `worker` | `lifecycle` | `worker.startup.completed` | `success` | Initial worker tick and processor bootstrap completed |
| `worker` | `lifecycle` | `worker.shutdown.failed` | `failed` | Graceful shutdown stop-hook failure |
| `worker` | `job` | `worker.job.tick_completed` | `success`, `partial_success` | Processor tick summary with standardized job counters |
| `worker` | `job` | `worker.job.tick_failed` | `failed` | Scheduled tick failed before completion |
| `worker` | `job` | `worker.job.retry_scheduled` | `retrying` | Retryable job item rescheduled |
| `worker` | `job` | `worker.job.item_failed` | `failed` | Individual item failure within a worker processor |
| `cli` | `command` | `cli.command.started` | `started` | Command lifecycle start |
| `cli` | `command` | `cli.command.completed` | `success`, `usage_shown` | Generic CLI completion summary |
| `cli` | `command` | `cli.command.failed` | `failed` | Generic CLI command failure |
| `cli` | `backup` | `cli.backup.completed` | `success` | Backup-specific completion details |
| `cli` | `backup` | `cli.backup.retention_prune_failed` | `warning` | Managed backup pruning degraded after export succeeded |
