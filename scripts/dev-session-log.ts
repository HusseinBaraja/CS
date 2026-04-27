import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  createConversationSessionLogSessionId,
  createConversationSessionLogSessionPath,
} from "@cs/core";

export const createDevSessionLogEnvironment = (input: {
  now?: () => Date;
  repoRoot: string;
}): Record<string, string> => {
  const sessionId = createConversationSessionLogSessionId(input.now);
  const logPath = createConversationSessionLogSessionPath({
    repoRoot: resolve(input.repoRoot),
    sessionId,
  });

  return {
    CONVERSATION_LOG_SESSION_ID: sessionId,
    CONVERSATION_LOG_SESSION_PATH: logPath,
  };
};

const DEFAULT_DEV_FILTERS = [
  "--filter=api",
  "--filter=bot",
  "--filter=worker",
  "--filter=web",
];

type SignalForwardingProcess = Pick<NodeJS.Process, "on" | "off"> & {
  exitCode: number | undefined;
};

type SignalForwardingChild = {
  killed: boolean;
  kill(signal?: NodeJS.Signals): void;
  once(event: "error", listener: (error: Error) => void): void;
  once(event: "exit", listener: (code: number | null) => void): void;
};

export const waitForChildExit = (input: {
  child: SignalForwardingChild;
  processRef?: SignalForwardingProcess;
}): Promise<void> => {
  const processRef = input.processRef ?? process;
  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!input.child.killed) {
      input.child.kill(signal);
    }
  };
  const cleanupSignalHandlers = () => {
    processRef.off("SIGINT", forwardSignal);
    processRef.off("SIGTERM", forwardSignal);
  };

  processRef.on("SIGINT", forwardSignal);
  processRef.on("SIGTERM", forwardSignal);

  return new Promise<void>((resolvePromise) => {
    let settled = false;
    const finish = (code: number) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanupSignalHandlers();
      processRef.exitCode = code;
      resolvePromise();
    };
    input.child.once("exit", (code) => {
      finish(code ?? 1);
    });
    input.child.once("error", (error) => {
      console.error("[dev-session-log] failed to spawn turbo:", error);
      finish(1);
    });
  });
};

export const createDevSessionLogSpawnConfig = (input: {
  extraArgs: string[];
  now?: () => Date;
  repoRoot: string;
}) => {
  const hasUserFilter = input.extraArgs.some(
    (arg) => arg === "--filter" || arg.startsWith("--filter="),
  );
  const devScope = hasUserFilter
    ? input.extraArgs
    : [...DEFAULT_DEV_FILTERS, ...input.extraArgs];

  return {
    command: process.execPath,
    args: ["x", "turbo", "run", "dev", "--concurrency=20", ...devScope],
    options: {
      cwd: input.repoRoot,
      env: {
        ...process.env,
        ...createDevSessionLogEnvironment({
          repoRoot: input.repoRoot,
          ...(input.now ? { now: input.now } : {}),
        }),
      },
      stdio: "inherit" as const,
    },
  };
};

const run = async () => {
  const repoRoot = resolve(import.meta.dir, "..");
  const config = createDevSessionLogSpawnConfig({
    repoRoot,
    extraArgs: process.argv.slice(2),
  });
  const child = spawn(config.command, config.args, config.options);

  await waitForChildExit({ child });
};

if (import.meta.main) {
  void run().catch((error) => {
    console.error("[dev-session-log] failed to run:", error);
    process.exitCode = 1;
  });
}
