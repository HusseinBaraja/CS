import { requireEnv } from '@cs/config';
import type { CliCommand } from './types';
import { getCliWorkspaceRoot, runInheritedCommand } from '../lib/process';

interface SeedRunDependencies {
  getOwnerPhone: () => string;
  getWorkspaceRoot: () => string;
  runConvex: (args: string[], options: { cwd: string }) => Promise<void>;
}

const defaultDependencies: SeedRunDependencies = {
  getOwnerPhone: () => requireEnv("SEED_OWNER_PHONE"),
  getWorkspaceRoot: getCliWorkspaceRoot,
  runConvex: runInheritedCommand,
};

export const buildSeedArgs = (ownerPhone: string): string[] => [
  "convex",
  "run",
  "--push",
  "--typecheck",
  "disable",
  "--codegen",
  "disable",
  "internal.seed.seedSampleData",
  JSON.stringify({ ownerPhone }),
];

export const runSeed = async (
  args: string[],
  dependencies: SeedRunDependencies = defaultDependencies
): Promise<void> => {
  if (args.length > 0) {
    throw new Error(`Unexpected arguments for seed: ${args.join(" ")}`);
  }

  await dependencies.runConvex(buildSeedArgs(dependencies.getOwnerPhone()), {
    cwd: dependencies.getWorkspaceRoot()
  });
};

export const seedCommand: CliCommand = {
  name: "seed",
  description: "Seed Convex with a RAG-ready sample catalog tenant (destructively resets any existing seeded tenant)",
  run: runSeed
};
