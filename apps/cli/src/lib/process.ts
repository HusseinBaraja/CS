interface InheritedSpawnOptions {
  cwd: string;
  stdin: "inherit";
  stdout: "inherit";
  stderr: "inherit";
}

interface SpawnedCommand {
  exited: Promise<number>;
}

type SpawnLike = (args: string[], options: InheritedSpawnOptions) => SpawnedCommand;

interface InheritedCommandOptions {
  cwd?: string;
  spawn?: SpawnLike;
}

export const runInheritedCommand = async (
  args: string[],
  options: InheritedCommandOptions = {}
): Promise<void> => {
  const spawn = options.spawn ?? Bun.spawn;
  const child = spawn(["bunx", ...args], {
    cwd: options.cwd ?? process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: bunx ${args.join(" ")}`);
  }
};
