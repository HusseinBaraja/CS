# WhatsApp Local Testing

This runbook covers the local seeded-tenant WhatsApp flow.

The repo is Bun-first overall, but the Baileys bot runtime is intentionally run on Node because pairing is not reliable under Bun's current WebSocket compatibility behavior.

## Runtime split

- API: Bun
- CLI: Bun
- Worker: Bun
- Bot: Node

You can still use the root command:

```bash
bun run dev:bot
```

That command routes through the bot package, which starts Node under the hood.

## Prerequisites

You need a valid `.env` with at least:

- `API_KEY`
- `CONVEX_URL`
- `CONVEX_ADMIN_KEY`
- `GEMINI_API_KEY`

See [`docs/ENVIRONMENT_VARIABLES.md`](C:/Users/Hussein/Desktop/Things/Zerone/Projects/CS/docs/ENVIRONMENT_VARIABLES.md) for the full environment reference.

## Seed the mock tenant

From the repo root:

```bash
bun run seed
```

This seeds the sample tenant and builds embeddings so the catalog is RAG-ready.

## Enable the bot for the seeded tenant

The seeded company must have:

- `config.botEnabled: true`
- a valid `ownerPhone`

You can set that through the API or through Convex internal company update calls.

## Start local services

From the repo root:

```bash
bun run dev:api
```

```bash
bun run dev:bot
```

Optional:

```bash
bun run dev:worker
```

## Open the operator page

Open:

```text
http://127.0.0.1:3000/runtime/bot
```

Enter the same `API_KEY` from `.env`.

If pairing is healthy, the seeded tenant should show a QR that can be scanned with the WhatsApp account that will act as the bot number.

## Auth session storage

Bot auth files live under:

```text
BOT_AUTH_DIR
```

By default:

```text
data/bot/auth
```

Each tenant gets its own session subdirectory keyed by the runtime session key.

## Re-pair one tenant

If a tenant auth state becomes unusable, clear only that tenant's auth directory and restart the bot.

Do not wipe the whole auth directory unless you intentionally want to reset every tenant session.

## Smoke test flow

1. Seed the tenant.
2. Enable `botEnabled`.
3. Start API.
4. Start bot.
5. Open `/runtime/bot`.
6. Scan the QR.
7. Send a WhatsApp message from another account to the paired bot number.

Example test messages:

- `hello`
- `Do you have burger boxes?`
- `عندكم علب برجر؟`

Expected result:

- session becomes `open`
- pairing artifact clears
- customer messages receive catalog-grounded replies from the seeded tenant

## If pairing fails before QR

Check:

- bot logs for Baileys startup failures
- API runtime operator session state
- tenant auth directory for stale or partial auth state
- that the seeded company is still `botEnabled: true`

If the bot process starts through Bun instead of Node, that is a bug in the launch path and should be fixed before debugging WhatsApp further.
