import { describe, expect, test } from 'bun:test';
import {
  buildBackupFileName,
  formatBackupTargetLabel,
  formatBackupTimestamp,
  parseBackupTimestamp,
  sanitizeBackupSegment,
} from './backup-paths';

describe("backup paths", () => {
  test("formats UTC timestamps for backup file names", () => {
    expect(formatBackupTimestamp(new Date("2026-03-09T14:30:15.999Z"))).toBe("20260309T143015Z");
  });

  test("sanitizes unsafe target segments", () => {
    expect(sanitizeBackupSegment(" Preview Name / 01 ")).toBe("preview-name-01");
  });

  test("formats target labels for each supported selector", () => {
    expect(formatBackupTargetLabel({ kind: "prod" })).toBe("prod");
    expect(formatBackupTargetLabel({ kind: "deployment-name", value: "Dev Main" })).toBe("deployment-dev-main");
    expect(formatBackupTargetLabel({ kind: "preview-name", value: "qa/blue" })).toBe("preview-qa-blue");
    expect(formatBackupTargetLabel({ kind: "env-file", value: "C:/tmp/.env.prod" })).toBe("envfile-.env.prod");
  });

  test("builds managed backup file names", () => {
    const fileName = buildBackupFileName(
      { kind: "deployment-name", value: "Acme Prod" },
      new Date("2026-03-09T14:30:15Z")
    );

    expect(fileName).toBe("convex-backup-deployment-acme-prod-20260309T143015Z.zip");
  });

  test("parses timestamps from managed backup names", () => {
    expect(parseBackupTimestamp("convex-backup-prod-20260309T143015Z.zip")).toBe(
      Date.parse("2026-03-09T14:30:15Z")
    );
    expect(parseBackupTimestamp("not-a-managed-backup.zip")).toBeNull();
  });
});
