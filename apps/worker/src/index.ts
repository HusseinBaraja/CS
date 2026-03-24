import { logger } from '@cs/core';
import { createConversationAutoResumeProcessor } from './conversationAutoResume';
import { createMediaCleanupProcessor } from './mediaCleanup';

interface WorkerLogger {
  info(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
}

type MediaCleanupProcessor = ReturnType<typeof createMediaCleanupProcessor>;
type ConversationAutoResumeProcessor = ReturnType<typeof createConversationAutoResumeProcessor>;

interface WorkerProcess {
  exitCode?: number;
  once(
    event: "SIGINT" | "SIGTERM" | "beforeExit",
    handler: (...args: unknown[]) => void | Promise<void>,
  ): unknown;
}

export interface StartWorkerOptions {
  createConversationAutoResumeProcessor?: () => ConversationAutoResumeProcessor;
  logger?: WorkerLogger;
  createMediaCleanupProcessor?: () => MediaCleanupProcessor;
  workerProcess?: WorkerProcess;
}

export const startWorker = async (options: StartWorkerOptions = {}): Promise<void> => {
  const workerLogger = options.logger ?? logger;
  const workerProcess = options.workerProcess ?? process;
  const conversationAutoResume = (options.createConversationAutoResumeProcessor ?? createConversationAutoResumeProcessor)();
  const mediaCleanup = (options.createMediaCleanupProcessor ?? createMediaCleanupProcessor)();

  workerLogger.info({ db: { provider: "convex" } }, "worker initialized");
  await conversationAutoResume.runTick();
  await mediaCleanup.runTick();

  const stopConversationAutoResume = conversationAutoResume.start();
  const stopMediaCleanup = mediaCleanup.start();
  let shuttingDown = false;

  const shutdown = async (signal: "SIGINT" | "SIGTERM" | "beforeExit"): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    const results = await Promise.allSettled([
      Promise.resolve(stopConversationAutoResume()),
      Promise.resolve(stopMediaCleanup()),
    ]);

    let failed = false;
    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        continue;
      }

      failed = true;
      workerLogger.error({
        error: result.reason,
        signal,
        stopTarget: index === 0 ? "conversationAutoResume" : "mediaCleanup",
      }, "worker shutdown failed");
    }

    if (failed) {
      workerProcess.exitCode = 1;
    }
  };

  for (const signal of ["SIGINT", "SIGTERM", "beforeExit"] as const) {
    workerProcess.once(signal, () => shutdown(signal));
  }
};

if (import.meta.main) {
  startWorker().catch((error) => {
    logger.error({ error }, "worker startup failed");
    process.exitCode = 1;
  });
}
