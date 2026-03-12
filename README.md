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
- `API_PORT`: optional, defaults to `3000`
- `CONVEX_ADMIN_KEY`: required for server-side internal Convex calls from the API
- `CONVEX_URL`: required for `api` and `worker`, unused by `bot` and `cli`
- `R2_BUCKET_NAME`: required for product media upload/download flows
- `R2_ENDPOINT`: required for product media upload/download flows
- `R2_ACCESS_KEY_ID`: required for product media upload/download flows
- `R2_SECRET_ACCESS_KEY`: required for product media upload/download flows

## Commands

```bash
bun install
bun run check
bun run test
bun run dev
```

### Targeted development

```bash
bun run dev:api
bun run dev:bot
bun run dev:worker
```

## Backups

Create a Convex snapshot from the repo root with:

```bash
bun run backup -- --prod
```

See `docs/operations/convex-backups.md` for manual dashboard backups, restore steps, and retention behavior.

## Notes

- The current environment contract only includes variables consumed by the live code.
- Future AI provider and storage variables should be added back when those integrations move beyond stubs.
