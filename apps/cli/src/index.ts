#!/usr/bin/env bun
import { env } from '@cs/config';
import {
  logEvent,
  logger,
  serializeErrorForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import { backupCommand } from './commands/backup';
import { seedCommand } from './commands/seed';
import type { CliCommand } from './commands/types';

const commands: CliCommand[] = [seedCommand, backupCommand];

const printUsage = (availableCommands: CliCommand[] = commands): void => {
  console.log("Usage: cs <command> [options]");
  console.log("");
  console.log("Commands:");

  for (const command of availableCommands) {
    console.log(`  ${command.name.padEnd(7)} ${command.description}`);
  }
};

export interface RunCliOptions {
  argv?: string[];
  commands?: CliCommand[];
  logger?: StructuredLogger;
  printUsage?: () => void;
}

export const runCli = async (options: RunCliOptions = {}): Promise<void> => {
  const [commandName, ...args] = (options.argv ?? process.argv.slice(2));
  const activeLogger = withLogBindings(options.logger ?? logger, {
    runtime: "cli",
    surface: "command",
  });
  const availableCommands = options.commands ?? commands;
  const usagePrinter = options.printUsage ?? (() => printUsage(availableCommands));

  if (!commandName) {
    usagePrinter();
    logEvent(
      activeLogger,
      "info",
      {
        event: "cli.command.completed",
        outcome: "usage_shown",
        commandName: "help",
        env: env.NODE_ENV,
      },
      "cli usage shown",
    );
    return;
  }

  const command = availableCommands.find((candidate) => candidate.name === commandName);
  const commandLogger = withLogBindings(activeLogger, {
    commandName,
  });

  if (!command) {
    usagePrinter();
    const error = new Error(`Unknown command: ${commandName}`);
    logEvent(
      commandLogger,
      "error",
      {
        event: "cli.command.failed",
        outcome: "failed",
        error: serializeErrorForLog(error),
      },
      "cli command failed",
    );
    throw error;
  }

  const startedAt = Date.now();
  logEvent(
    commandLogger,
    "info",
    {
      event: "cli.command.started",
      outcome: "started",
    },
    "cli command started",
  );

  try {
    await command.run(args);
    logEvent(
      commandLogger,
      "info",
      {
        event: "cli.command.completed",
        outcome: "success",
        durationMs: Date.now() - startedAt,
      },
      "cli command completed",
    );
  } catch (error) {
    logEvent(
      commandLogger,
      "error",
      {
        event: "cli.command.failed",
        outcome: "failed",
        durationMs: Date.now() - startedAt,
        error: serializeErrorForLog(error),
      },
      "cli command failed",
    );
    throw error;
  }
};

if (import.meta.main) {
  try {
    await runCli();
  } catch {
    process.exitCode = 1;
  }
}
