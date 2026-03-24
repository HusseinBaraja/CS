# CS

Monorepo for the API, bot, CLI, worker, and shared packages.

## Requirements

- Bun `1.3.9`
- Node.js `23.x` or newer for tooling compatibility

## Environment Setup

1. Copy `.env.example` to `.env`.
2. If you plan to run the API, set both `CONVEX_URL` and `CONVEX_ADMIN_KEY` in `.env`.
3. `CONVEX_ADMIN_KEY` is required for server-side internal Convex calls from the API.
4. `CONVEX_URL` is also required if you plan to run the worker.
5. Product image management also requires the R2 variables when using media endpoints.
6. AI chat-provider health checks and future orchestration require the AI provider variables when those providers are enabled in `AI_PROVIDER_ORDER`.

Example:

```bash
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_ADMIN_KEY=your-admin-key
```

### Active environment variables

- `NODE_ENV`: optional, defaults to `development`
- `LOG_LEVEL`: optional, defaults to `debug`
- `LOG_DIR`: optional, defaults to `logs`
- `LOG_RETENTION_DAYS`: optional, defaults to `14`
- `BACKUP_DIR`: optional, defaults to `backups`
- `BACKUP_RETENTION_COUNT`: optional, defaults to `5`
- `BOT_AUTH_DIR`: optional, defaults to `data/bot/auth`
- `API_PORT`: optional, defaults to `3000`
- `AI_PROVIDER_ORDER`: optional, defaults to `deepseek,gemini,groq`
- `AI_REQUEST_TIMEOUT_MS`: optional, defaults to `15000`
- `AI_HEALTHCHECK_TIMEOUT_MS`: optional, defaults to `5000`
- `AI_MAX_RETRIES_PER_PROVIDER`: optional, defaults to `1`
- `CONVEX_ADMIN_KEY`: required for server-side internal Convex calls from the API
- `CONVEX_URL`: required for `api` and `worker`, unused by `bot` and `cli`
- `DEEPSEEK_API_KEY`: required if `deepseek` is expected to be healthy and usable
- `DEEPSEEK_BASE_URL`: optional override for the DeepSeek OpenAI-compatible endpoint
- `DEEPSEEK_CHAT_MODEL`: required if `deepseek` is expected to be healthy and usable
- `GEMINI_API_KEY`: required for Gemini embeddings today and also required if `gemini` is expected to be healthy and usable for chat
- `GEMINI_CHAT_MODEL`: required if `gemini` is expected to be healthy and usable for chat
- `GROQ_API_KEY`: required if `groq` is expected to be healthy and usable
- `GROQ_CHAT_MODEL`: required if `groq` is expected to be healthy and usable
- `R2_BUCKET_NAME`: required for product media upload/download flows
- `R2_ENDPOINT`: required for product media upload/download flows
- `R2_ACCESS_KEY_ID`: required for product media upload/download flows
- `R2_SECRET_ACCESS_KEY`: required for product media upload/download flows

Provider semantics:

- Global AI knobs are optional and fall back to code defaults.
- A provider can remain unconfigured, but if it stays in `AI_PROVIDER_ORDER` its health check should report it as misconfigured until its key and model are provided.
- `DEEPSEEK_BASE_URL` is optional; the runtime uses the standard DeepSeek OpenAI-compatible base URL when it is unset.

## Commands

```bash
bun install
bun run check
bun run test
```

### Targeted development

```bash
bun run web
bun run dev:web
bun run dev:api
bun run dev:bot
bun run dev:worker
```

Use `bun run web` from the repository root to start the frontend app on `0.0.0.0:5173` so other devices on the same LAN or hotspot can open it.
Use `bun run dev:web` when you specifically want the Turbo workspace dev flow instead.

## Operations Guides

- AI provider setup and smoke tests: [`docs/operations/ai-provider-setup.md`](docs/operations/ai-provider-setup.md)
- Product image upload flow: [`docs/operations/product-image-upload-api.md`](docs/operations/product-image-upload-api.md)

## Backups

Create a Convex snapshot from the repo root with:

```bash
bun run backup -- --prod
```

See `docs/operations/convex-backups.md` for manual dashboard backups, restore steps, and retention behavior.

## Notes

- The environment contract now includes the live AI chat-provider variables used by `@cs/ai`.
