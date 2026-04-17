import { logEvent, logger, serializeErrorForLog } from '@cs/core';
import { createConversationAutoResumeProcessor } from './conversationAutoResume';
import { type WorkerLogger, withWorkerRuntimeLogger } from './logging';
import { createMediaCleanupProcessor } from './mediaCleanup';
import { createPendingAssistantReconciliationProcessor } from './pendingAssistantReconciliation';

type MediaCleanupProcessor = ReturnType<typeof createMediaCleanupProcessor>;
type ConversationAutoResumeProcessor = ReturnType<typeof createConversationAutoResumeProcessor>;
type PendingAssistantReconciliationProcessor = ReturnType<typeof createPendingAssistantReconciliationProcessor>;
type RetryableErrorLike = Error & { code?: unknown };

const WORKER_STARTUP_RETRY_DELAYS_MS = [250, 500, 1_000] as const;
const TRANSIENT_STARTUP_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]);

const isTransientStartupError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as RetryableErrorLike;
  if (typeof errorWithCode.code === "string" && TRANSIENT_STARTUP_ERROR_CODES.has(errorWithCode.code)) {
    return true;
  }

  return error.message.includes("The socket connection was closed unexpectedly");
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

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
  const workerLogger = withWorkerRuntimeLogger(options.logger ?? logger, "lifecycle");
  const workerProcess = options.workerProcess ?? process;
  const conversationAutoResume = (options.createConversationAutoResumeProcessor ?? createConversationAutoResumeProcessor)();
  const pendingAssistantReconciliation =
    (options.createPendingAssistantReconciliationProcessor ?? createPendingAssistantReconciliationProcessor)();
  const mediaCleanup = (options.createMediaCleanupProcessor ?? createMediaCleanupProcessor)();

  const runStartupTickWithRetry = async (tickName: string, runTick: () => Promise<unknown>) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await runTick();
        return;
      } catch (error) {
        const retryDelayMs = WORKER_STARTUP_RETRY_DELAYS_MS[attempt];
        if (!isTransientStartupError(error) || retryDelayMs === undefined) {
          throw error;
        }

        logEvent(
          workerLogger,
          "warn",
          {
            event: "worker.startup.retry_scheduled",
            runtime: "worker",
            surface: "lifecycle",
            outcome: "retrying",
            tickName,
            attempt: attempt + 1,
            retryDelayMs,
            error: serializeErrorForLog(error),
          },
          "worker startup tick failed; retrying",
        );

        await sleep(retryDelayMs);
      }
    }
  };

  await runStartupTickWithRetry("conversationAutoResume", conversationAutoResume.runTick);
  await runStartupTickWithRetry("pendingAssistantReconciliation", pendingAssistantReconciliation.runTick);
  await runStartupTickWithRetry("mediaCleanup", mediaCleanup.runTick);
  logEvent(
    workerLogger,
    "info",
    {
      event: "worker.startup.completed",
      runtime: "worker",
      surface: "lifecycle",
      outcome: "success",
      dbProvider: "convex",
    },
    "worker startup completed",
  );

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
      logEvent(
        workerLogger,
        "error",
        {
          event: "worker.shutdown.failed",
          runtime: "worker",
          surface: "lifecycle",
          outcome: "failed",
          error: serializeErrorForLog(result.reason),
          signal,
          stopTarget: index === 0
            ? "conversationAutoResume"
            : index === 1
              ? "pendingAssistantReconciliation"
              : "mediaCleanup",
        },
        "worker shutdown failed",
      );
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
    logEvent(
      withWorkerRuntimeLogger(logger, "lifecycle"),
      "error",
      {
        event: "worker.startup.failed",
        runtime: "worker",
        surface: "lifecycle",
        outcome: "failed",
        error: serializeErrorForLog(error),
      },
      "worker startup failed",
    );
    process.exitCode = 1;
  });
}
