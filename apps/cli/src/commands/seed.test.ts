import { describe, expect, test } from 'bun:test';
import { buildSeedArgs, runSeed } from './seed';

describe("seed command", () => {
  test("builds convex run args that push local functions before seeding", () => {
    expect(buildSeedArgs()).toEqual([
      "convex",
      "run",
      "--push",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      "internal.seed.seedSampleData",
      "{}",
    ]);
  });

  test("rejects unexpected positional arguments", async () => {
    await expect(runSeed(["extra"])).rejects.toThrow("Unexpected arguments for seed: extra");
  });
});
