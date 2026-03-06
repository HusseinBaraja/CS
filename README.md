# CS

Monorepo for the API, bot, CLI, worker, and shared packages.

## Requirements

- Bun `1.3.9`
- Node.js `23.x` or newer for tooling compatibility

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Set `CONVEX_URL` if you plan to run the API or worker.

### Active environment variables

- `NODE_ENV`: optional, defaults to `development`
- `LOG_LEVEL`: optional, defaults to `debug`
- `API_PORT`: optional, defaults to `3000`
- `CONVEX_URL`: required for `api` and `worker`, unused by `bot` and `cli`

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

## Notes

- The current environment contract only includes variables consumed by the live code.
- Future AI provider and storage variables should be added back when those integrations move beyond stubs.
