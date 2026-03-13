import { describe, expect, test } from 'bun:test';
import {
  assertOpenGrepInstalled,
  OPEN_GREP_INSTALL_MESSAGE,
  OpenGrepCommandError,
  resolveOpenGrepArgs,
  runOpenGrep,
  type SpawnLike,
} from './opengrep';

const createSpawn = (
  implementation: (args: string[]) => number | Promise<number>,
): SpawnLike => (args) => ({
  exited: Promise.resolve(implementation(args)),
});

describe("resolveOpenGrepArgs", () => {
  test("builds the default repo scan command", () => {
    expect(resolveOpenGrepArgs([])).toEqual([
      "scan",
      "--config",
      "opengrep.yml",
      "apps",
      "packages",
      "convex",
    ]);
  });

  test("forwards user-supplied targets and flags", () => {
    expect(resolveOpenGrepArgs(["apps/api/src", "--json"])).toEqual([
      "scan",
      "--config",
      "opengrep.yml",
      "apps/api/src",
      "--json",
    ]);
  });
});

describe("assertOpenGrepInstalled", () => {
  test("accepts a working OpenGrep binary", async () => {
    await expect(
      assertOpenGrepInstalled(
        createSpawn((args) => {
          expect(args).toEqual(["opengrep", "--version"]);
          return 0;
        }),
      ),
    ).resolves.toBeUndefined();
  });

  test("throws a clear install error when the binary is missing", async () => {
    await expect(
      assertOpenGrepInstalled(createSpawn(() => 1)),
    ).rejects.toThrow(OPEN_GREP_INSTALL_MESSAGE);
  });
});

describe("runOpenGrep", () => {
  test("executes the resolved scan command", async () => {
    const spawnedArgs: string[][] = [];

    await expect(
      runOpenGrep(
        resolveOpenGrepArgs([]),
        createSpawn((args) => {
          spawnedArgs.push(args);
          return 0;
        }),
      ),
    ).resolves.toBeUndefined();

    expect(spawnedArgs).toEqual([
      ["opengrep", "scan", "--config", "opengrep.yml", "apps", "packages", "convex"],
    ]);
  });

  test("propagates non-zero exit codes", async () => {
    try {
      await runOpenGrep(resolveOpenGrepArgs(["apps/api/src"]), createSpawn(() => 3));
      throw new Error("Expected OpenGrep to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenGrepCommandError);
      expect((error as OpenGrepCommandError).exitCode).toBe(3);
      expect((error as OpenGrepCommandError).message).toBe("OpenGrep exited with code 3");
    }
  });
});
