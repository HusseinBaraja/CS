import type { CliCommand } from './types';
import { runInheritedCommand } from '../lib/process';

const runSeed = async (args: string[]): Promise<void> => {
  if (args.length > 0) {
    throw new Error(`Unexpected arguments for seed: ${args.join(" ")}`);
  }

  await runInheritedCommand(
    [
      "convex",
      "run",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      "internal.seed.seedSampleData",
      "{}"
    ],
    {
      cwd: process.cwd()
    }
  );
};

export const seedCommand: CliCommand = {
  name: "seed",
  description: "Seed Convex with a RAG-ready sample catalog tenant (destructively resets any existing seeded tenant)",
  run: runSeed
};
