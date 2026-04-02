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

That command now starts both:

- the API on Bun, which serves `/runtime/bot`
- the bot on Node, which runs the Baileys session runtime

If you run the bot package directly instead, the bot still starts on Node only and you must run the API separately to use the operator page.

## Prerequisites

You need a valid `.env` with at least:

- `API_KEY`
- `CONVEX_URL`
- `CONVEX_ADMIN_KEY`
- `GEMINI_API_KEY`
- `SEED_OWNER_PHONE`

See [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md) for the full environment reference.

## Seed the mock tenant

From the repo root:

```bash
bun run seed
```

This seeds the sample tenant and builds embeddings so the catalog is RAG-ready.

If the seeded tenant already exists, reseeding refreshes its catalog data in place and preserves the same tenant identity. That means reseeding alone should not force a fresh WhatsApp QR unless the tenant auth state was separately cleared or became invalid.

## Seeded tenant defaults

The seeded company is created with:

- `config.botEnabled: true`
- `ownerPhone: SEED_OWNER_PHONE` from `.env`

If the operator page still shows `0 tenant session(s) loaded`, check that the API and bot are pointed at the same Convex deployment you seeded.
If the operator page shows the tenant as `stale` right after seeding, wait one heartbeat interval for the running bot runtime to reconcile the newly seeded tenant.
If it still stays stale after that window, verify that the API and bot are pointed at the same Convex deployment and inspect the bot logs for startup failures.

## Start local services

From the repo root:

```bash
bun run dev:bot
```

Optional:

```bash
bun run dev:worker
```

Alternative:

```bash
bun run dev
```

This starts API, bot, web, and worker together. Use it when you want the full local runtime set instead of the focused WhatsApp operator flow.

## Open the operator page

Open:

```text
http://127.0.0.1:3000/runtime/bot
```

Enter the same `API_KEY` from `.env`.

That page is served by the API, so if it is unreachable the first thing to check is whether the API process started successfully inside the combined `bun run dev:bot` output.

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

Because the seeded tenant identity is preserved across reseeds, its auth directory should also remain stable across repeated `bun run seed` runs.

## Re-pair one tenant

If a tenant auth state becomes unusable, clear only that tenant's auth directory and restart the bot.

Do not wipe the whole auth directory unless you intentionally want to reset every tenant session.

## Smoke test flow

1. Seed the tenant.
2. Confirm the seeded tenant is present in the target Convex deployment.
3. Start `bun run dev:bot`.
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
- that the seeded company still exists in the same Convex deployment used by API and bot

If the bot process starts through Bun instead of Node, that is a bug in the launch path and should be fixed before debugging WhatsApp further.
