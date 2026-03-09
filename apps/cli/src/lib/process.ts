export const runInheritedCommand = async (
  args: string[],
  options: {
    cwd?: string;
  } = {}
): Promise<void> => {
  const child = Bun.spawn(["bunx", ...args], {
    cwd: options.cwd ?? process.cwd(),
    stdout: "inherit",
    stderr: "inherit"
  });

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: bunx ${args.join(" ")}`);
  }
};
