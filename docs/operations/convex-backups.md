# Convex Backups

This project uses Convex snapshot export/import for database backups.

## What is included

- Convex table data
- Convex schema metadata inside the snapshot ZIP
- Convex file storage only when exported with `--include-file-storage`

## What is not included

- Cloudflare R2 objects
- Application code
- Environment variables
- PM2 state
- Logs and local runtime files

## Manual backup from Convex Dashboard

1. Open the target deployment in Convex Dashboard.
2. Create a backup snapshot from the deployment backup/restore area.
3. Download the generated snapshot ZIP when it is ready.

Use dashboard backups when you need a one-off manual snapshot. Convex currently documents export/import as beta, so keep restore validation part of your operating routine.

## Automated backup from this repo

Run from the repo root:

```bash
bun run backup -- --prod
```

Other supported selectors:

```bash
bun run backup -- --deployment-name <deployment-name>
bun run backup -- --preview-name <preview-name>
bun run backup -- --env-file .env.local
```

Optional flags:

```bash
bun run backup -- --prod --retention 7 --out-dir backups
bun run backup -- --prod --include-file-storage
```

Behavior:

- writes snapshots to `BACKUP_DIR` (`backups` by default)
- names files as `convex-backup-<target>-<timestamp>.zip`
- keeps only the newest `BACKUP_RETENTION_COUNT` managed snapshots
- requires an explicit deployment selector to avoid accidental dev exports

## Restore

Restore into a fresh or disposable deployment first:

```bash
bunx convex import --deployment-name <fresh-deployment> --replace-all -y backups/<snapshot>.zip
```

Notes:

- restore is destructive when used with `--replace-all`
- validate the restored data in Convex Dashboard before treating the snapshot as good
- import/export defaults to the dev deployment if you omit a selector, so keep selectors explicit

## Verification checklist

- snapshot ZIP exists locally
- ZIP contains table directories and `generated_schema.jsonl`
- import succeeds into a fresh dev or preview deployment
- expected tables and documents appear after restore
