import type { CliCommand } from './types';
import { runInheritedCommand } from '../lib/process';

const runSeed = async (): Promise<void> => {
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
  description: "Seed Convex with sample catalog data",
  run: runSeed
};
