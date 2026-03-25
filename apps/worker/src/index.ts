import { logger } from '@cs/core';
import { createConversationAutoResumeProcessor } from './conversationAutoResume';
import { createMediaCleanupProcessor } from './mediaCleanup';
import { createPendingAssistantReconciliationProcessor } from './pendingAssistantReconciliation';

interface WorkerLogger {
  info(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
}

type MediaCleanupProcessor = ReturnType<typeof createMediaCleanupProcessor>;
type ConversationAutoResumeProcessor = ReturnType<typeof createConversationAutoResumeProcessor>;
type PendingAssistantReconciliationProcessor = ReturnType<typeof createPendingAssistantReconciliationProcessor>;

interface WorkerProcess {
  exitCode?: number;
  once(
    event: "SIGINT" | "SIGTERM" | "beforeExit",
    handler: (...args: unknown[]) => void | Promise<void>,
  ): unknown;
}

export interface StartWorkerOptions {
  createConversationAutoResumeProcessor?: () => ConversationAutoResumeProcessor;
  createPendingAssistantReconciliationProcessor?: () => PendingAssistantReconciliationProcessor;
  logger?: WorkerLogger;
  createMediaCleanupProcessor?: () => MediaCleanupProcessor;
  workerProcess?: WorkerProcess;
}

export const startWorker = async (options: StartWorkerOptions = {}): Promise<void> => {
  const workerLogger = options.logger ?? logger;
  const workerProcess = options.workerProcess ?? process;
  const conversationAutoResume = (options.createConversationAutoResumeProcessor ?? createConversationAutoResumeProcessor)();
  const pendingAssistantReconciliation =
    (options.createPendingAssistantReconciliationProcessor ?? createPendingAssistantReconciliationProcessor)();
  const mediaCleanup = (options.createMediaCleanupProcessor ?? createMediaCleanupProcessor)();

  workerLogger.info({ db: { provider: "convex" } }, "worker initialized");
  await conversationAutoResume.runTick();
  await pendingAssistantReconciliation.runTick();
  await mediaCleanup.runTick();

  const stopConversationAutoResume = conversationAutoResume.start();
  const stopPendingAssistantReconciliation = pendingAssistantReconciliation.start();
  const stopMediaCleanup = mediaCleanup.start();
  let shuttingDown = false;

  const shutdown = async (signal: "SIGINT" | "SIGTERM" | "beforeExit"): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    const results = await Promise.allSettled([
      Promise.resolve(stopConversationAutoResume()),
      Promise.resolve(stopPendingAssistantReconciliation()),
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
          stopTarget: index === 0
            ? "conversationAutoResume"
            : index === 1
              ? "pendingAssistantReconciliation"
              : "mediaCleanup",
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
