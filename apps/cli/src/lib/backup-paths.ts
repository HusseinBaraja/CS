import { basename } from 'node:path';

export interface BackupTarget {
  kind: "prod" | "deployment-name" | "preview-name" | "env-file";
  value?: string;
}

const timestampSegment = (value: number): string => value.toString().padStart(2, "0");

export const formatBackupTimestamp = (date: Date): string =>
  [
    date.getUTCFullYear().toString(),
    timestampSegment(date.getUTCMonth() + 1),
    timestampSegment(date.getUTCDate())
  ].join("")
    + "T"
    + [
      timestampSegment(date.getUTCHours()),
      timestampSegment(date.getUTCMinutes()),
      timestampSegment(date.getUTCSeconds())
    ].join("")
    + "Z";

export const sanitizeBackupSegment = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  return sanitized || "unknown";
};

export const formatBackupTargetLabel = (target: BackupTarget): string => {
  switch (target.kind) {
    case "prod":
      return "prod";
    case "deployment-name":
      return `deployment-${sanitizeBackupSegment(target.value ?? "")}`;
    case "preview-name":
      return `preview-${sanitizeBackupSegment(target.value ?? "")}`;
    case "env-file":
      return `envfile-${sanitizeBackupSegment(basename(target.value ?? ""))}`;
  }
};

export const buildBackupFileName = (target: BackupTarget, date: Date): string =>
  `convex-backup-${formatBackupTargetLabel(target)}-${formatBackupTimestamp(date)}.zip`;

export const isManagedBackupFile = (fileName: string): boolean =>
  /^convex-backup-.+-\d{8}T\d{6}Z\.zip$/i.test(fileName);

export const parseBackupTimestamp = (fileName: string): number | null => {
  const match = fileName.match(/-(\d{8}T\d{6}Z)\.zip$/i);
  if (!match) {
    return null;
  }

  const [, rawTimestamp] = match;
  const parsed = Date.parse(
    `${rawTimestamp.slice(0, 4)}-${rawTimestamp.slice(4, 6)}-${rawTimestamp.slice(6, 8)}`
      + `T${rawTimestamp.slice(9, 11)}:${rawTimestamp.slice(11, 13)}:${rawTimestamp.slice(13, 15)}Z`
  );

  return Number.isNaN(parsed) ? null : parsed;
};
