import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const entryPath = process.argv[2];

if (!entryPath) {
  console.error("Usage: pnpm exec tsx scripts/watch-from-root.ts <entry-path>");
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
const child = spawn(process.execPath, [
  "--watch",
  "--env-file-if-exists",
  envFile,
  "--import",
  "tsx",
  resolvedEntry,
], {
  cwd: repoRoot,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
