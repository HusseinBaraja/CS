import { describe, expect, test } from 'bun:test';
import type { CliCommand } from './commands/types';
import { runCli } from './index';

const createLoggerStub = () => {
  const infoCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const errorCalls: Array<{ payload: Record<string, unknown>; message: string }> = [];

  const createLogger = (bindings: Record<string, unknown> = {}) => ({
    debug: (payload: Record<string, unknown>, message: string) => {
      infoCalls.push({ payload: { ...bindings, ...payload }, message });
    },
    info: (payload: Record<string, unknown>, message: string) => {
      infoCalls.push({ payload: { ...bindings, ...payload }, message });
    },
    warn: () => undefined,
    error: (payload: Record<string, unknown>, message: string) => {
      errorCalls.push({ payload: { ...bindings, ...payload }, message });
    },
    child: (childBindings: Record<string, unknown>) => createLogger({ ...bindings, ...childBindings }),
  });

  return {
    logger: createLogger(),
    infoCalls,
    errorCalls,
  };
};

describe("runCli", () => {
  test("logs command start and completion for successful commands", async () => {
    const { logger, infoCalls, errorCalls } = createLoggerStub();
    const commandCalls: string[][] = [];
    const commands: CliCommand[] = [
      {
        name: "seed",
        description: "seed data",
        run: async (args) => {
          commandCalls.push(args);
        },
      },
    ];

    await runCli({
      argv: ["seed", "--dry-run"],
      commands,
      logger,
      printUsage: () => undefined,
    });

    expect(commandCalls).toEqual([["--dry-run"]]);
    expect(infoCalls).toEqual([
      {
        payload: {
          runtime: "cli",
          surface: "command",
          commandName: "seed",
          event: "cli.command.started",
          outcome: "started",
        },
        message: "cli command started",
      },
      {
        payload: {
          runtime: "cli",
          surface: "command",
          commandName: "seed",
          event: "cli.command.completed",
          outcome: "success",
          durationMs: expect.any(Number),
        },
        message: "cli command completed",
      },
    ]);
    expect(errorCalls).toEqual([]);
  });

  test("logs usage when no command is provided", async () => {
    const { logger, infoCalls } = createLoggerStub();
    const callOrder: string[] = [];

    await runCli({
      argv: [],
      commands: [],
      logger,
      printUsage: () => {
        callOrder.push("usage");
        expect(infoCalls).toHaveLength(0);
      },
    });

    expect(callOrder).toEqual(["usage"]);
    expect(infoCalls).toEqual([
      {
        payload: {
          runtime: "cli",
          surface: "command",
          event: "cli.command.completed",
          outcome: "usage_shown",
          commandName: "help",
          env: expect.any(String),
        },
        message: "cli usage shown",
      },
    ]);
  });

  test("logs command failures for unknown commands", async () => {
    const { logger, errorCalls } = createLoggerStub();
    let usageCallCount = 0;

    await expect(runCli({
      argv: ["unknown"],
      commands: [],
      logger,
      printUsage: () => {
        usageCallCount += 1;
      },
    })).rejects.toThrow("Unknown command: unknown");

    expect(usageCallCount).toBe(1);
    expect(errorCalls).toEqual([
      {
        payload: {
          runtime: "cli",
          surface: "command",
          commandName: "unknown",
          event: "cli.command.failed",
          outcome: "failed",
          error: expect.objectContaining({
            message: "Unknown command: unknown",
            name: "Error",
          }),
        },
        message: "cli command failed",
      },
    ]);
  });

  test("prints injected commands when using the default usage printer", async () => {
    const { logger } = createLoggerStub();
    const commands: CliCommand[] = [
      {
        name: "custom",
        description: "custom command",
        run: async () => undefined,
      },
    ];
    const originalConsoleLog = console.log;
    const logLines: string[] = [];
    console.log = (...args: unknown[]) => {
      logLines.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      await runCli({
        argv: [],
        commands,
        logger,
      });
    } finally {
      console.log = originalConsoleLog;
    }

    expect(logLines).toContain("Usage: cs <command> [options]");
    expect(logLines).toContain("Commands:");
    expect(logLines.some((line) => line.includes("custom") && line.includes("custom command"))).toBe(true);
    expect(logLines.some((line) => line.includes("backup"))).toBe(false);
    expect(logLines.some((line) => line.includes("seed"))).toBe(false);
  });
});
