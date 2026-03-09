import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isManagedBackupFile, parseBackupTimestamp } from './backup-paths';

export interface ManagedBackupRecord {
  name: string;
  path: string;
  timestamp: number;
}

export const listManagedBackups = async (directory: string): Promise<ManagedBackupRecord[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && isManagedBackupFile(entry.name));

  return Promise.all(
    files.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      const parsedTimestamp = parseBackupTimestamp(entry.name);
      const metadata = await stat(fullPath);

      return {
        name: entry.name,
        path: fullPath,
        timestamp: parsedTimestamp ?? metadata.mtimeMs
      };
    })
  );
};

export const sortManagedBackups = (backups: ManagedBackupRecord[]): ManagedBackupRecord[] =>
  [...backups].sort((left, right) => right.timestamp - left.timestamp || right.name.localeCompare(left.name));

export const pruneManagedBackups = async (
  directory: string,
  keepCount: number
): Promise<string[]> => {
  const backups = sortManagedBackups(await listManagedBackups(directory));
  const staleBackups = backups.slice(keepCount);
  const deleted: string[] = [];

  for (const backup of staleBackups) {
    await rm(backup.path, { force: true });
    deleted.push(backup.path);
  }

  return deleted;
};
