import { spawn as nodeSpawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface InheritedSpawnOptions {
  cwd: string;
  stdin: "inherit";
  stdout: "inherit";
  stderr: "inherit";
}

interface SpawnedCommand {
  exited: Promise<number>;
  kill?: () => void;
}

type SpawnLike = (args: string[], options: InheritedSpawnOptions) => SpawnedCommand;

interface InheritedCommandOptions {
  cwd?: string;
  spawn?: SpawnLike;
  timeoutMs?: number;
}

const CLI_WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export const getCliWorkspaceRoot = (): string => CLI_WORKSPACE_ROOT;

export const runInheritedCommand = async (
  args: string[],
  options: InheritedCommandOptions = {}
): Promise<void> => {
  const spawn = options.spawn ?? ((commandWithArgs, spawnOptions) => {
    const [command, ...commandArgs] = commandWithArgs;
    const child = nodeSpawn(command, commandArgs, {
      cwd: spawnOptions.cwd,
      stdio: "inherit",
    });

    return {
      exited: new Promise<number>((resolveExit, rejectExit) => {
        child.once("exit", (code) => resolveExit(code ?? 1));
        child.once("error", rejectExit);
      }),
      kill: () => child.kill(),
    };
  });
  const commandArgs = ["pnpm", "exec", ...args];
  const child = spawn(commandArgs, {
    cwd: options.cwd ?? process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });

  const exitCode =
    options.timeoutMs === undefined
      ? await child.exited
      : await new Promise<number>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          child.kill?.();
          reject(
            new Error(
              `runInheritedCommand timed out after ${options.timeoutMs}ms waiting for child.exited from spawn(${JSON.stringify(commandArgs)}); original args: ${JSON.stringify(args)}`
            )
          );
        }, options.timeoutMs);

        child.exited.then(
          (code) => {
            clearTimeout(timeoutId);
            resolve(code);
          },
          (error) => {
            clearTimeout(timeoutId);
            reject(error);
          }
        );
      });

  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: pnpm exec ${args.join(" ")}`);
  }
};
