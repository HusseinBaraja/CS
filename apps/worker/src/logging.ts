import {
  logEvent,
  serializeErrorForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';

export type WorkerLogger = StructuredLogger;

export const withWorkerRuntimeLogger = (
  logger: WorkerLogger,
  surface: string,
): WorkerLogger =>
  withLogBindings(logger, {
    runtime: "worker",
    surface,
  });

export const withWorkerJobLogger = (
  logger: WorkerLogger,
  jobName: string,
): WorkerLogger =>
  withLogBindings(logger, {
    runtime: "worker",
    surface: "job",
    jobName,
  });

export const logWorkerTickCompleted = (
  logger: WorkerLogger,
  payload: {
    jobName: string;
    processedCount: number;
    succeededCount: number;
    failedCount: number;
    retryCount: number;
    durationMs: number;
  } & Record<string, unknown>,
  message: string,
): void => {
  logEvent(
    logger,
    "info",
    {
      event: "worker.job.tick_completed",
      runtime: "worker",
      surface: "job",
      outcome: payload.failedCount > 0 ? "partial_success" : "success",
      ...payload,
    },
    message,
  );
};

export const logWorkerTickFailed = (
  logger: WorkerLogger,
  jobName: string,
  error: unknown,
  durationMs: number,
  message: string,
): void => {
  logEvent(
    logger,
    "error",
    {
      event: "worker.job.tick_failed",
      runtime: "worker",
      surface: "job",
      outcome: "failed",
      jobName,
      durationMs,
      error: serializeErrorForLog(error),
    },
    message,
  );
};

export const logWorkerItemFailed = (
  logger: WorkerLogger,
  error: unknown,
  payload: {
    jobName: string;
  } & Record<string, unknown>,
  message: string,
): void => {
  logEvent(
    logger,
    "error",
    {
      event: "worker.job.item_failed",
      runtime: "worker",
      surface: "job",
      outcome: "failed",
      ...payload,
      error: serializeErrorForLog(error),
    },
    message,
  );
};

export const logWorkerRetryScheduled = (
  logger: WorkerLogger,
  payload: {
    jobName: string;
  } & Record<string, unknown>,
  message: string,
): void => {
  logEvent(
    logger,
    "warn",
    {
      event: "worker.job.retry_scheduled",
      runtime: "worker",
      surface: "job",
      outcome: "retrying",
      ...payload,
    },
    message,
  );
};
