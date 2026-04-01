import { describe, expect, mock, test } from 'bun:test';
import { buildSeedArgs, runSeed } from './seed';

describe("seed command", () => {
  test("builds convex run args that push local functions before seeding", () => {
    expect(buildSeedArgs("967771408660")).toEqual([
      "convex",
      "run",
      "--push",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      "internal.seed.seedSampleData",
      "{\"ownerPhone\":\"967771408660\"}",
    ]);
  });

  test("rejects unexpected positional arguments", async () => {
    await expect(runSeed(["extra"])).rejects.toThrow("Unexpected arguments for seed: extra");
  });

  test("runs convex from the workspace root and passes the owner phone payload", async () => {
    const getOwnerPhone = mock(() => "967771408660");
    const getWorkspaceRoot = mock(() => "C:/repo");
    const runConvex = mock(async () => undefined);

    await runSeed([], {
      getOwnerPhone,
      getWorkspaceRoot,
      runConvex,
    });

    expect(getOwnerPhone).toHaveBeenCalledTimes(1);
    expect(getWorkspaceRoot).toHaveBeenCalledTimes(1);
    expect(runConvex).toHaveBeenCalledWith(buildSeedArgs("967771408660"), {
      cwd: "C:/repo",
    });
  });
});
