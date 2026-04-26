import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import {
  createDevSessionLogEnvironment,
  createDevSessionLogSpawnConfig,
  waitForChildExit,
} from "./dev-session-log";

const repoRoot = resolve("repo");

describe("createDevSessionLogEnvironment", () => {
  test("creates one shared session id and markdown path for a dev run", () => {
    const env = createDevSessionLogEnvironment({
      now: () => new Date(2026, 3, 19, 10, 11, 12, 345),
      repoRoot,
    });

    expect(env.CONVERSATION_LOG_SESSION_ID).toBe("19-04-10-11");
    expect(env.CONVERSATION_LOG_SESSION_PATH).toBe(join(
      repoRoot,
      "logs",
      "conversations",
      `${env.CONVERSATION_LOG_SESSION_ID}.md`,
    ));
  });
});

describe("createDevSessionLogSpawnConfig", () => {
  test("builds direct spawn config without shell parsing", () => {
    const config = createDevSessionLogSpawnConfig({
      repoRoot,
      extraArgs: ["--filter=@cs/web app"],
      now: () => new Date(2026, 3, 19, 10, 11, 12, 345),
    });

    expect(config.command).toBe(process.execPath);
    expect(config.args).toEqual([
      "x",
      "turbo",
      "run",
      "dev",
      "--concurrency=20",
      "--filter=@cs/web app",
    ]);
    expect(config.options.stdio).toBe("inherit");
    expect(config.options).not.toHaveProperty("shell");
  });
});

describe("waitForChildExit", () => {
  class FakeProcess extends EventEmitter {
    exitCode: number | undefined;
  }

  class FakeChild extends EventEmitter {
    killed = false;
    public killedSignals: string[] = [];

    kill(signal?: NodeJS.Signals) {
      if (signal) {
        this.killedSignals.push(signal);
      }
      this.killed = true;
    }
  }

  test("sets non-zero exit code and resolves on child error", async () => {
    const fakeProcess = new FakeProcess();
    const fakeChild = new FakeChild();
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const waitPromise = waitForChildExit({
        child: fakeChild,
        processRef: fakeProcess,
      });

      fakeChild.emit("error", new Error("spawn failed"));
      await waitPromise;
    } finally {
      console.error = originalConsoleError;
    }

    expect(fakeProcess.exitCode).toBe(1);
  });

  test("forwards SIGINT to child and cleans handlers on exit", async () => {
    const fakeProcess = new FakeProcess();
    const fakeChild = new FakeChild();
    const waitPromise = waitForChildExit({
      child: fakeChild,
      processRef: fakeProcess,
    });

    fakeProcess.emit("SIGINT", "SIGINT");
    fakeChild.emit("exit", 0);
    await waitPromise;

    expect(fakeChild.killedSignals).toEqual(["SIGINT"]);
    fakeProcess.emit("SIGINT", "SIGINT");
    expect(fakeChild.killedSignals).toEqual(["SIGINT"]);
  });

  test("keeps first terminal event exit code when error and exit both fire", async () => {
    const fakeProcess = new FakeProcess();
    const fakeChild = new FakeChild();
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const waitPromise = waitForChildExit({
        child: fakeChild,
        processRef: fakeProcess,
      });

      fakeChild.emit("error", new Error("spawn failed"));
      fakeChild.emit("exit", 0);
      await waitPromise;
    } finally {
      console.error = originalConsoleError;
    }

    expect(fakeProcess.exitCode).toBe(1);
  });
});
