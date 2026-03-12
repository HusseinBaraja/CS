import { logger } from '@cs/core';
import { createMediaCleanupProcessor } from './mediaCleanup';

interface WorkerLogger {
  info(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
}

type MediaCleanupProcessor = ReturnType<typeof createMediaCleanupProcessor>;

interface WorkerProcess {
  exitCode?: number;
  once(
    event: "SIGINT" | "SIGTERM" | "beforeExit",
    handler: (...args: unknown[]) => void | Promise<void>,
  ): unknown;
}

export interface StartWorkerOptions {
  logger?: WorkerLogger;
  createMediaCleanupProcessor?: () => MediaCleanupProcessor;
  workerProcess?: WorkerProcess;
}

export const startWorker = async (options: StartWorkerOptions = {}): Promise<void> => {
  const workerLogger = options.logger ?? logger;
  const workerProcess = options.workerProcess ?? process;
  const mediaCleanup = (options.createMediaCleanupProcessor ?? createMediaCleanupProcessor)();

  workerLogger.info({ db: { provider: "convex" } }, "worker initialized");
  await mediaCleanup.runTick();

  const stopMediaCleanup = mediaCleanup.start();
  let shuttingDown = false;

  const shutdown = async (signal: "SIGINT" | "SIGTERM" | "beforeExit"): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      await Promise.resolve(stopMediaCleanup());
    } catch (error) {
      workerLogger.error({ error, signal }, "worker shutdown failed");
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
