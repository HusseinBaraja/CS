import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { getCliWorkspaceRoot, runInheritedCommand } from './process';

describe("getCliWorkspaceRoot", () => {
  test("resolves the monorepo root from the CLI package", () => {
    expect(getCliWorkspaceRoot()).toBe(resolve(import.meta.dir, "../../../.."));
  });
});

describe("runInheritedCommand", () => {
  test("inherits stdin, stdout, and stderr for interactive commands", async () => {
    let capturedArgs: string[] | undefined;
    let capturedOptions:
      | {
      cwd: string;
      stdin: "inherit";
      stdout: "inherit";
      stderr: "inherit";
    }
      | undefined;

    await runInheritedCommand(["convex", "export", "--prod"], {
      cwd: "C:/repo",
      spawn: (args, options) => {
        capturedArgs = [...args];
        capturedOptions = options;

        return {
          exited: Promise.resolve(0)
        };
      }
    });

    expect(capturedArgs).toEqual(["bunx", "convex", "export", "--prod"]);
    expect(capturedOptions).toEqual({
      cwd: "C:/repo",
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    });
  });

  test("throws when the spawned command exits non-zero", async () => {
    await expect(
      runInheritedCommand(["convex", "export"], {
        spawn: () => ({
          exited: Promise.resolve(1)
        })
      })
    ).rejects.toThrow("Command failed with exit code 1: bunx convex export");
  });

  test("kills the spawned command and throws a timeout error when it exceeds timeoutMs", async () => {
    let killed = false;

    await expect(
      runInheritedCommand(["convex", "export"], {
        timeoutMs: 10,
        spawn: () => ({
          exited: new Promise<number>(() => {
          }),
          kill: () => {
            killed = true;
          }
        })
      })
    ).rejects.toThrow("runInheritedCommand timed out after 10ms");

    expect(killed).toBe(true);
  });
});
