#!/usr/bin/env bun
import { env } from '@cs/config';
import { logError, logger } from '@cs/core';

const printUsage = (): void => {
  console.log("Usage: cs <command>");
  console.log("");
  console.log("Commands:");
  console.log("  seed    Seed Convex with sample catalog data");
};

const runSeed = async (): Promise<void> => {
  const child = Bun.spawn(
    [
      "bunx",
      "convex",
      "run",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      "internal.seed.seedSampleData",
      "{}",
    ],
    {
      cwd: process.cwd(),
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`convex run failed with exit code ${exitCode}`);
  }
};

const main = async (): Promise<void> => {
  const [command] = process.argv.slice(2);

  if (!command) {
    logger.info({ env: env.NODE_ENV }, "cli ready");
    printUsage();
    return;
  }

  switch (command) {
    case "seed":
      await runSeed();
      return;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
};

try {
  await main();
} catch (error) {
  logError(logger, error, "cli command failed");
  process.exitCode = 1;
}
