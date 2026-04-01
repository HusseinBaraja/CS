import type { CliCommand } from './types';
import { getCliWorkspaceRoot, runInheritedCommand } from '../lib/process';

interface SeedRunDependencies {
  getWorkspaceRoot: () => string;
  runConvex: (args: string[], options: { cwd: string }) => Promise<void>;
}

const defaultDependencies: SeedRunDependencies = {
  getWorkspaceRoot: getCliWorkspaceRoot,
  runConvex: runInheritedCommand,
};

export const buildSeedArgs = (): string[] => [
  "convex",
  "run",
  "--push",
  "--typecheck",
  "disable",
  "--codegen",
  "disable",
  "internal.seed.seedSampleData",
  "{}",
];

export const runSeed = async (
  args: string[],
  dependencies: SeedRunDependencies = defaultDependencies
): Promise<void> => {
  if (args.length > 0) {
    throw new Error(`Unexpected arguments for seed: ${args.join(" ")}`);
  }

  await dependencies.runConvex(buildSeedArgs(), {
    cwd: dependencies.getWorkspaceRoot()
  });
};

export const seedCommand: CliCommand = {
  name: "seed",
  description: "Seed Convex with a RAG-ready sample catalog tenant (destructively resets any existing seeded tenant)",
  run: runSeed
};
