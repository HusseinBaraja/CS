import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const entryPath = process.argv[2];

if (!entryPath) {
  console.error("Usage: bun scripts/watch-from-root.ts <entry-path>");
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const resolvedEntry = resolve(process.cwd(), entryPath);

if (!existsSync(resolvedEntry)) {
  console.error(`Entry file not found: ${entryPath}`);
  process.exit(1);
}

const envFile = resolve(repoRoot, ".env");
const child = Bun.spawn([
  "bun",
  "--cwd",
  repoRoot,
  `--env-file=${envFile}`,
  "--watch",
  resolvedEntry,
], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await child.exited);
