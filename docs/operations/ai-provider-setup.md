# AI Provider Setup And Connection Checks

This guide explains how to fill the AI chat-provider environment variables and how to verify that the configured providers can accept authenticated requests from this repo.

## What These Variables Do

```env
AI_PROVIDER_ORDER=deepseek,gemini,groq
AI_REQUEST_TIMEOUT_MS=15000
AI_HEALTHCHECK_TIMEOUT_MS=5000
AI_MAX_RETRIES_PER_PROVIDER=1
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=
DEEPSEEK_CHAT_MODEL=
GEMINI_API_KEY=
GEMINI_CHAT_MODEL=
GROQ_API_KEY=
GROQ_CHAT_MODEL=
```

## How To Fill Them

### Global AI runtime knobs

`AI_PROVIDER_ORDER`

- Comma-separated failover order.
- First provider is the primary path, later providers are backups.
- Keep only providers you actually intend to use.

Example:

```env
AI_PROVIDER_ORDER=deepseek,gemini,groq
```

`AI_REQUEST_TIMEOUT_MS`

- Timeout for normal provider chat calls.
- This is per provider attempt, not the total multi-provider failover budget.

Example:

```env
AI_REQUEST_TIMEOUT_MS=15000
```

`AI_HEALTHCHECK_TIMEOUT_MS`

- Timeout for the provider smoke-test and health-check request.
- Keep this shorter than the normal request timeout.

Example:

```env
AI_HEALTHCHECK_TIMEOUT_MS=5000
```

`AI_MAX_RETRIES_PER_PROVIDER`

- Number of retries per provider before higher-level failover would move on.
- `0` means one attempt only.
- `1` means one initial attempt plus one retry.

Example:

```env
AI_MAX_RETRIES_PER_PROVIDER=1
```

### DeepSeek

`DEEPSEEK_API_KEY`

- Your DeepSeek API key.

`DEEPSEEK_BASE_URL`

- Optional.
- Leave blank unless you need a custom proxy or a non-default OpenAI-compatible endpoint.
- When blank, the repo uses the standard DeepSeek OpenAI-compatible base URL.

`DEEPSEEK_CHAT_MODEL`

- The exact DeepSeek chat model id you want this repo to call.

Example:

```env
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_BASE_URL=
DEEPSEEK_CHAT_MODEL=deepseek-chat
```

### Gemini

`GEMINI_API_KEY`

- Your Gemini API key.
- This key is also used by the existing embedding flow in this repo.

`GEMINI_CHAT_MODEL`

- The exact Gemini chat model id you want this repo to call.

Example:

```env
GEMINI_API_KEY=your_gemini_key
GEMINI_CHAT_MODEL=gemini-2.0-flash
```

### Groq

`GROQ_API_KEY`

- Your Groq API key.

`GROQ_CHAT_MODEL`

- The exact Groq model id you want this repo to call.

Example:

```env
GROQ_API_KEY=your_groq_key
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
```

## Recommended Starting `.env` Block

This is a reasonable local starting point if you want all three providers enabled:

```env
AI_PROVIDER_ORDER=deepseek,gemini,groq
AI_REQUEST_TIMEOUT_MS=15000
AI_HEALTHCHECK_TIMEOUT_MS=5000
AI_MAX_RETRIES_PER_PROVIDER=1

DEEPSEEK_API_KEY=replace_me
DEEPSEEK_BASE_URL=
DEEPSEEK_CHAT_MODEL=deepseek-chat

GEMINI_API_KEY=replace_me
GEMINI_CHAT_MODEL=gemini-2.0-flash

GROQ_API_KEY=replace_me
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
```

These model ids are examples already used in this repo’s tests and docs. Treat them as starting points, not as a guarantee that they are the latest or best production choices for your provider account.

## Important Semantics

- A provider left in `AI_PROVIDER_ORDER` but missing its API key or model will report as misconfigured.
- Leaving a provider fully blank is fine if you also remove it from `AI_PROVIDER_ORDER`.
- `DEEPSEEK_BASE_URL` should usually stay blank unless you know you need to override it.
- This check only verifies provider authentication and request acceptance. It does not verify retrieval, prompting, or bot orchestration.

## How To Test Provider Connections

The repo now includes a smoke-test command that calls the internal provider health checks directly:

```powershell
bun run check:ai
```

That command:

- reads the repo-root `.env`
- loads the current AI runtime config
- checks every provider listed in `AI_PROVIDER_ORDER`
- returns a non-zero exit code if any checked provider is unhealthy

### Check all configured providers

```powershell
bun run check:ai
```

### Check only one provider

```powershell
bun run check:ai deepseek
```

```powershell
bun run check:ai gemini
```

```powershell
bun run check:ai groq
```

### Check a subset in a custom order

```powershell
bun run check:ai gemini groq
```

## How To Read The Output

Healthy example:

```text
OK deepseek model=deepseek-chat latencyMs=412
OK gemini model=gemini-2.0-flash latencyMs=231
OK groq model=llama-3.3-70b-versatile latencyMs=188
```

Misconfigured example:

```text
FAIL deepseek model=deepseek-chat errorKind=configuration disposition=do_not_retry message="Missing API key for deepseek"
```

Transient outage example:

```text
FAIL groq model=llama-3.3-70b-versatile errorKind=unavailable disposition=failover_provider message="service unavailable"
```

## Troubleshooting

`errorKind=configuration`

- The provider is missing its API key or chat model.
- Fix the provider-specific env vars first.

`errorKind=authentication`

- The key is present but rejected by the provider.
- Check for whitespace, revoked keys, or keys from the wrong account/project.

`errorKind=rate_limit`

- The key works but the provider is throttling requests.
- Retry later or use a different provider order.

`errorKind=unavailable`

- The provider endpoint could not serve the request.
- This usually means a transient outage, network issue, or server-side failure.

`errorKind=timeout`

- The provider did not respond within `AI_HEALTHCHECK_TIMEOUT_MS`.
- Increase the timeout slightly or investigate network latency.

## Notes

- Run these checks from the repository root.
- The command does not require the API or bot process to be running.
- If you rotate keys, rerun `bun run check:ai` immediately after updating `.env`.
