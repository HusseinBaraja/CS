import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  createConversationSessionLogSessionId,
  createConversationSessionLogSessionPath,
} from "../packages/core/src/conversationSessionLog";

export const createDevSessionLogEnvironment = (input: {
  now?: () => Date;
  repoRoot: string;
}): Record<string, string> => {
  const sessionId = createConversationSessionLogSessionId(input.now);
  const logDirectory = resolve(input.repoRoot, "logs", "conversations");
  const logPath = resolve(createConversationSessionLogSessionPath({
    logDirectory,
    sessionId,
  }));

  return {
    CONVERSATION_LOG_SESSION_ID: sessionId,
    CONVERSATION_LOG_SESSION_PATH: logPath,
  };
};

const run = async () => {
  const repoRoot = resolve(import.meta.dir, "..");
  const extraArgs = process.argv.slice(2);
  const child = spawn(
    "bun",
    ["x", "turbo", "run", "dev", "--concurrency=20", ...extraArgs],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...createDevSessionLogEnvironment({ repoRoot }),
      },
      shell: true,
      stdio: "inherit",
    },
  );

  await new Promise<void>((resolvePromise, reject) => {
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
      resolvePromise();
    });
    child.once("error", reject);
  });
};

if (import.meta.main) {
  void run();
}
