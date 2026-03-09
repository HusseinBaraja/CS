import { describe, expect, test } from 'bun:test';
import { runInheritedCommand } from './process';

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
});
