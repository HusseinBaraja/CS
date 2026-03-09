import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConvexExportArgs, resolveBackupOptions, runBackup } from './backup';

describe("backup command", () => {
  test("requires exactly one deployment selector", () => {
    expect(() => resolveBackupOptions([])).toThrow("Exactly one deployment selector is required for backups");
    expect(() => resolveBackupOptions(["--prod", "--deployment-name", "dev-main"])).toThrow(
      "Exactly one deployment selector is required for backups"
    );
  });

  test("rejects invalid retention counts", () => {
    expect(() => resolveBackupOptions(["--prod", "--retention", "0"])).toThrow("Invalid retention count: 0");
    expect(() => resolveBackupOptions(["--prod", "--retention", "abc"])).toThrow("Invalid retention count: abc");
    expect(() => resolveBackupOptions(["--prod", "--retention", "1.5"])).toThrow("Invalid retention count: 1.5");
    expect(() => resolveBackupOptions(["--prod", "--retention", "5days"])).toThrow(
      "Invalid retention count: 5days"
    );
  });

  test("builds convex export args for production with optional storage", () => {
    expect(
      buildConvexExportArgs(
        { kind: "prod" },
        "C:/tmp/backup.zip",
        true
      )
    ).toEqual(["convex", "export", "--path", "C:/tmp/backup.zip", "--prod", "--include-file-storage"]);
  });

  test("creates a backup and prunes only managed files beyond retention", async () => {
    const backupDir = await mkdtemp(join(tmpdir(), "cs-backup-"));
    const staleManaged = join(backupDir, "convex-backup-prod-20260308T143015Z.zip");
    const unrelatedFile = join(backupDir, "notes.txt");

    await writeFile(staleManaged, "stale");
    await writeFile(unrelatedFile, "keep");

    const result = await runBackup(
      ["--prod", "--out-dir", backupDir, "--retention", "1"],
      {
        now: () => new Date("2026-03-09T14:30:15Z"),
        runExport: async (args) => {
          const zipPath = args[3];
          if (!zipPath) {
            throw new Error("expected export path");
          }

          await writeFile(zipPath, "fresh");
        }
      }
    );

    const files = await readdir(backupDir);
    expect(result.zipPath).toBe(join(backupDir, "convex-backup-prod-20260309T143015Z.zip"));
    expect(files).toContain("convex-backup-prod-20260309T143015Z.zip");
    expect(files).not.toContain("convex-backup-prod-20260308T143015Z.zip");
    expect(files).toContain("notes.txt");

    await rm(backupDir, { recursive: true, force: true });
  });

  test("removes a partially created backup when export fails", async () => {
    const backupDir = await mkdtemp(join(tmpdir(), "cs-backup-fail-"));

    await expect(
      runBackup(
        ["--deployment-name", "dev-main", "--out-dir", backupDir],
        {
          now: () => new Date("2026-03-09T14:30:15Z"),
          runExport: async (args) => {
            const zipPath = args[3];
            if (!zipPath) {
              throw new Error("expected export path");
            }

            await writeFile(zipPath, "partial");
            throw new Error("simulated export failure");
          }
        }
      )
    ).rejects.toThrow("simulated export failure");

    const files = await readdir(backupDir);
    expect(files).toEqual([]);

    await rm(backupDir, { recursive: true, force: true });
  });
});
