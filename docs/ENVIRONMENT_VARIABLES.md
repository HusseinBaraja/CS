# Environment Variables

This file explains the variables in [`/.env.example`](../.env.example).

The source of truth for validation and defaults is [`packages/config/src/index.ts`](../packages/config/src/index.ts).

## General

### `NODE_ENV`

- Controls the runtime environment.
- Allowed values: `development`, `test`, `production`.
- Default: `development`.

### `LOG_LEVEL`

- Controls application log verbosity.
- Allowed values: `debug`, `info`, `warn`, `error`.
- Default: `debug`.

### `BACKUP_DIR`

- Directory used by the CLI backup command to store generated backups.
- Default: `backups`.

### `BACKUP_RETENTION_COUNT`

- Number of managed backup files to keep before older ones are pruned.
- Default: `5`.

### `BOT_AUTH_DIR`

- Base directory for Baileys WhatsApp auth/session files.
- Default: `data/bot/auth`.

### `LOG_DIR`

- Directory used for application log files.
- Default: `logs`.

### `LOG_RETENTION_DAYS`

- Number of days to keep rotated log files.
- Default: `14`.

## Seed / Local Testing

### `SEED_OWNER_PHONE`

- Owner phone number used by `bun run seed` when creating the single seeded sample tenant.
- Required for CLI seeding.
- Keep this set in local `.env` if you use the seeded WhatsApp testing flow.

## API

### `API_PORT`

- Port used by the Hono API server.
- Default: `3000`.

### `API_KEY`

- Shared API key for protected API routes and the bot runtime operator page.
- Optional in config, but required for normal protected API use.

### `API_CORS_ORIGINS`

- Allowed CORS origins for the API.
- Use `*` for wildcard or a comma-separated list of explicit origins.
- Default: `*`.

### `API_TRUSTED_PROXY_IPS`

- Comma-separated proxy IP allowlist for trusting forwarded client IP headers.
- Leave blank when not running behind trusted proxies.
- Default: empty.

### `API_TRUST_PROXY_HOPS`

- Number of trusted proxy hops to honor when deriving client IPs.
- Default: `0`.

### `API_RATE_LIMIT_MAX`

- Maximum number of protected API requests allowed per client within the rate-limit window.
- Default: `60`.

### `API_RATE_LIMIT_MAX_ENTRIES`

- Maximum number of client entries kept in the in-memory rate-limit store before LRU eviction.
- Default: `10000`.

### `API_RATE_LIMIT_WINDOW_MS`

- Rate-limit window duration in milliseconds.
- Default: `60000`.

## Convex

### `CONVEX_ADMIN_KEY`

- Admin key used by server-side Convex admin clients.
- Required for most API, bot, worker, and CLI flows that talk to Convex.

### `CONVEX_URL`

- Convex deployment URL.
- Required anywhere the app connects to Convex.

## AI Providers

### `AI_HEALTHCHECK_TIMEOUT_MS`

- Timeout in milliseconds for provider health checks.
- Default: `5000`.

### `AI_MAX_RETRIES_PER_PROVIDER`

- Number of retries a provider adapter can attempt before failover.
- Default: `1`.

### `AI_PROVIDER_ORDER`

- Comma-separated provider order for chat failover.
- Default: `deepseek,gemini,groq`.

### `AI_REQUEST_TIMEOUT_MS`

- Timeout in milliseconds for chat generation requests.
- Default: `15000`.

### `CONVERSATION_HISTORY_WINDOW_MESSAGES`

- Number of recent messages passed into conversation orchestration/history windows.
- Default: `20`.

### `DEEPSEEK_API_KEY`

- API key for DeepSeek chat requests.
- Optional unless DeepSeek is used.

### `DEEPSEEK_BASE_URL`

- Optional DeepSeek-compatible base URL override.
- Leave blank to use the provider default.

### `DEEPSEEK_CHAT_MODEL`

- Model name for DeepSeek chat requests.
- Optional unless DeepSeek is used.

### `GEMINI_API_KEY`

- API key for Gemini chat and embeddings.
- Required for embedding generation and for Gemini chat if Gemini is enabled.

### `GEMINI_CHAT_MODEL`

- Model name for Gemini chat requests.
- Optional unless Gemini chat is used.

### `GROQ_API_KEY`

- API key for Groq chat requests.
- Optional unless Groq is used.

### `GROQ_CHAT_MODEL`

- Model name for Groq chat requests.
- Optional unless Groq is used.

## Cloudflare R2

### `R2_BUCKET_NAME`

- Bucket name used for product media storage.
- Required only if image upload/storage features are used.

### `R2_ENDPOINT`

- Cloudflare R2 S3-compatible endpoint URL.
- Optional in config; required only if image upload/storage features are used.

### `R2_ACCESS_KEY_ID`

- Access key ID for R2.
- Optional in config; required only if image upload/storage features are used.

### `R2_SECRET_ACCESS_KEY`

- Secret access key for R2.
- Optional in config; required only if image upload/storage features are used.

## Practical Minimums

### Local API + bot + seeded WhatsApp test

Usually needed:
- `API_KEY`
- `CONVEX_URL`
- `CONVEX_ADMIN_KEY`
- `GEMINI_API_KEY`
- `SEED_OWNER_PHONE`

Often useful:
- `GEMINI_CHAT_MODEL`
- `AI_PROVIDER_ORDER`

### Full media upload support

Also needed:
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Notes

- Empty strings for optional secrets are treated as unset.
- Several defaults are applied automatically by the config layer.
- The repo is Bun-first overall, but the Baileys bot runtime is intentionally started on Node for local pairing and operation because QR registration is not reliable under Bun's current WebSocket compatibility behavior.
- The app validates these values through [`packages/config/src/index.ts`](../packages/config/src/index.ts), so if this document and the schema ever disagree, trust the schema.
