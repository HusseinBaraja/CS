const DEFAULT_SCAN_TARGETS = ["apps", "packages", "convex"] as const;
const OPEN_GREP_CONFIG_PATH = "opengrep.yml";
const OPEN_GREP_RELEASES_URL = "https://github.com/opengrep/opengrep/releases";

type SpawnOptions = {
  cwd?: string;
  stdin?: "inherit" | "ignore";
  stdout?: "inherit" | "ignore";
  stderr?: "inherit" | "ignore";
};

type SpawnedProcess = {
  exited: Promise<number>;
};

export type SpawnLike = (args: string[], options: SpawnOptions) => SpawnedProcess;

export class OpenGrepCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = "OpenGrepCommandError";
  }
}

const OPEN_GREP_INSTALL_MESSAGE =
  "OpenGrep is not installed or is not available on PATH. Install it from " +
  `${OPEN_GREP_RELEASES_URL} and verify the \`opengrep\` binary is reachable from your shell.`;

export const resolveOpenGrepArgs = (userArgs: string[]): string[] => [
  "scan",
  "--config",
  OPEN_GREP_CONFIG_PATH,
  ...(userArgs.length > 0 ? userArgs : DEFAULT_SCAN_TARGETS),
];

const defaultSpawn: SpawnLike = (args, options) =>
  Bun.spawn(args, {
    cwd: options.cwd ?? process.cwd(),
    stdin: options.stdin ?? "inherit",
    stdout: options.stdout ?? "inherit",
    stderr: options.stderr ?? "inherit",
  });

const runSpawnedProcess = async (
  args: string[],
  options: SpawnOptions,
  spawn: SpawnLike,
): Promise<number> => {
  try {
    return await spawn(args, options).exited;
  } catch (error) {
    throw new Error(
      `Failed to start ${args.join(" ")}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const assertOpenGrepInstalled = async (spawn: SpawnLike = defaultSpawn): Promise<void> => {
  try {
    const exitCode = await runSpawnedProcess(
      ["opengrep", "--version"],
      {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      },
      spawn,
    );

    if (exitCode !== 0) {
      throw new Error(OPEN_GREP_INSTALL_MESSAGE);
    }
  } catch (error) {
    if (error instanceof Error && error.message === OPEN_GREP_INSTALL_MESSAGE) {
      throw error;
    }

    throw new Error(OPEN_GREP_INSTALL_MESSAGE);
  }
};

export const runOpenGrep = async (
  args: string[],
  spawn: SpawnLike = defaultSpawn,
): Promise<void> => {
  const exitCode = await runSpawnedProcess(
    ["opengrep", ...args],
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
    spawn,
  );

  if (exitCode !== 0) {
    throw new OpenGrepCommandError(`OpenGrep exited with code ${exitCode}`, exitCode);
  }
};

const main = async (): Promise<void> => {
  try {
    await assertOpenGrepInstalled();
    await runOpenGrep(resolveOpenGrepArgs(Bun.argv.slice(2)));
  } catch (error) {
    if (error instanceof OpenGrepCommandError) {
      process.exitCode = error.exitCode;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  await main();
}

export { OPEN_GREP_CONFIG_PATH, OPEN_GREP_INSTALL_MESSAGE, OPEN_GREP_RELEASES_URL };
