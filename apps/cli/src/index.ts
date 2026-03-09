#!/usr/bin/env bun
import { env } from '@cs/config';
import { logError, logger } from '@cs/core';
import { backupCommand } from './commands/backup';
import { seedCommand } from './commands/seed';
import type { CliCommand } from './commands/types';

const commands: CliCommand[] = [seedCommand, backupCommand];

const printUsage = (): void => {
  console.log("Usage: cs <command> [options]");
  console.log("");
  console.log("Commands:");

  for (const command of commands) {
    console.log(`  ${command.name.padEnd(7)} ${command.description}`);
  }
};

const main = async (): Promise<void> => {
  const [commandName, ...args] = process.argv.slice(2);

  if (!commandName) {
    logger.info({ env: env.NODE_ENV }, "cli ready");
    printUsage();
    return;
  }

  const command = commands.find((candidate) => candidate.name === commandName);
  if (!command) {
    printUsage();
    throw new Error(`Unknown command: ${commandName}`);
  }

  await command.run(args);
};

try {
  await main();
} catch (error) {
  logError(logger, error, "cli command failed");
  process.exitCode = 1;
}
