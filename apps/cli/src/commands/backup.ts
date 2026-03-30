import { access, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { env } from '@cs/config';
import {
  logEvent,
  logger,
  serializeErrorForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import type { BackupTarget } from '../lib/backup-paths';
import { buildBackupFileName } from '../lib/backup-paths';
import { runInheritedCommand } from '../lib/process';
import { pruneManagedBackups } from '../lib/retention';
import type { CliCommand } from './types';

const usageLines = [
  "Usage: cs backup (--prod | --deployment-name <name> | --preview-name <name> | --env-file <path>) [options]",
  "",
  "Options:",
  "  --out-dir <path>             Output directory for backup ZIPs",
  "  --retention <count>          Number of managed backups to keep",
  "  --include-file-storage       Include Convex file storage in the export",
  "  --help                       Show command usage"
];

interface BackupRunDependencies {
  now: () => Date;
  runExport: (args: string[]) => Promise<void>;
  logger?: StructuredLogger;
}

const defaultDependencies: BackupRunDependencies = {
  now: () => new Date(),
  runExport: (args) =>
    runInheritedCommand(args, {
      cwd: process.cwd()
    })
};

interface ResolvedBackupOptions {
  includeFileStorage: boolean;
  outDir: string;
  retentionCount: number;
  target: BackupTarget;
}

const printBackupUsage = (): void => {
  for (const line of usageLines) {
    console.log(line);
  }
};

const resolveBackupTarget = (values: {
  "deployment-name"?: string;
  "env-file"?: string;
  "preview-name"?: string;
  prod?: boolean;
}): BackupTarget => {
  const definedTargets: BackupTarget[] = [];

  if (values.prod) {
    definedTargets.push({ kind: "prod" });
  }

  if (values["deployment-name"]) {
    definedTargets.push({
      kind: "deployment-name",
      value: values["deployment-name"]
    });
  }

  if (values["preview-name"]) {
    definedTargets.push({
      kind: "preview-name",
      value: values["preview-name"]
    });
  }

  if (values["env-file"]) {
    definedTargets.push({
      kind: "env-file",
      value: values["env-file"]
    });
  }

  if (definedTargets.length !== 1) {
    throw new Error("Exactly one deployment selector is required for backups");
  }

  return definedTargets[0];
};

const parseRetentionCount = (value: string | undefined): number => {
  if (!value) {
    return env.BACKUP_RETENTION_COUNT;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid retention count: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid retention count: ${value}`);
  }

  return parsed;
};

export const resolveBackupOptions = (args: string[]): ResolvedBackupOptions => {
  const { values } = parseArgs({
    args,
    options: {
      "deployment-name": {
        type: "string"
      },
      "env-file": {
        type: "string"
      },
      help: {
        type: "boolean"
      },
      "include-file-storage": {
        type: "boolean"
      },
      "out-dir": {
        type: "string"
      },
      "preview-name": {
        type: "string"
      },
      prod: {
        type: "boolean"
      },
      retention: {
        type: "string"
      }
    },
    strict: true,
    allowPositionals: false
  });

  if (values.help) {
    printBackupUsage();
    process.exitCode = 0;
    throw new Error("__CLI_HELP__");
  }

  return {
    includeFileStorage: values["include-file-storage"] ?? false,
    outDir: resolve(process.cwd(), values["out-dir"] ?? env.BACKUP_DIR),
    retentionCount: parseRetentionCount(values.retention),
    target: resolveBackupTarget(values)
  };
};

export const buildConvexExportArgs = (target: BackupTarget, zipPath: string, includeFileStorage: boolean): string[] => {
  const args = ["convex", "export", "--path", zipPath];

  switch (target.kind) {
    case "prod":
      args.push("--prod");
      break;
    case "deployment-name":
      args.push("--deployment-name", target.value!);
      break;
    case "preview-name":
      args.push("--preview-name", target.value!);
      break;
    case "env-file":
      args.push("--env-file", target.value!);
      break;
  }

  if (includeFileStorage) {
    args.push("--include-file-storage");
  }

  return args;
};

const ensureWritableDirectory = async (directory: string): Promise<void> => {
  await mkdir(directory, { recursive: true });
  await access(directory, constants.W_OK);
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const runBackup = async (
  args: string[],
  dependencies: BackupRunDependencies = defaultDependencies
): Promise<{ deletedBackups: string[]; zipPath: string }> => {
  const commandLogger = withLogBindings(dependencies.logger ?? logger, {
    runtime: "cli",
    surface: "backup",
    commandName: "backup",
  });
  const startedAt = Date.now();
  const options = resolveBackupOptions(args);
  const zipPath = join(options.outDir, buildBackupFileName(options.target, dependencies.now()));

  await ensureWritableDirectory(options.outDir);
  if (await pathExists(zipPath)) {
    throw new Error(`Backup file already exists: ${zipPath}`);
  }

  const exportArgs = buildConvexExportArgs(options.target, zipPath, options.includeFileStorage);

  try {
    await dependencies.runExport(exportArgs);
  } catch (error) {
    if (await pathExists(zipPath)) {
      await rm(zipPath, { force: true });
    }

    throw error;
  }

  let deletedBackups: string[] = [];
  try {
    deletedBackups = await pruneManagedBackups(options.outDir, options.retentionCount);
  } catch (error) {
    logEvent(
      commandLogger,
      "warn",
      {
        event: "cli.backup.retention_prune_failed",
        outcome: "warning",
        backupDir: options.outDir,
        retentionCount: options.retentionCount,
        error: serializeErrorForLog(error),
      },
      "backup retention pruning failed"
    );
  }

  logEvent(
    commandLogger,
    "info",
    {
      event: "cli.backup.completed",
      outcome: "success",
      deletedCount: deletedBackups.length,
      durationMs: Date.now() - startedAt,
      includeFileStorage: options.includeFileStorage,
      retentionCount: options.retentionCount,
      zipPath
    },
    "backup completed"
  );

  return {
    deletedBackups,
    zipPath
  };
};

const runBackupCommand = async (args: string[]): Promise<void> => {
  try {
    await runBackup(args);
  } catch (error) {
    if (error instanceof Error && error.message === "__CLI_HELP__") {
      return;
    }

    throw error;
  }
};

export const backupCommand: CliCommand = {
  name: "backup",
  description: "Export a Convex snapshot to a local timestamped ZIP",
  run: runBackupCommand
};
