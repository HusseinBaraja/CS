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

export const runInheritedCommand = async (
  args: string[],
  options: InheritedCommandOptions = {}
): Promise<void> => {
  const spawn = options.spawn ?? Bun.spawn;
  const commandArgs = ["bunx", ...args];
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
    throw new Error(`Command failed with exit code ${exitCode}: bunx ${args.join(" ")}`);
  }
};
