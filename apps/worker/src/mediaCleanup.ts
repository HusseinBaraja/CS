import { logger as defaultLogger } from '@cs/core';
import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import { ConfigError } from '@cs/shared';
import { createR2Storage, type ObjectStorage, StorageError } from '@cs/storage';

const MEDIA_CLEANUP_RETRY_DELAYS_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
] as const;

const DEFAULT_MEDIA_CLEANUP_INTERVAL_MS = 15_000;
const DEFAULT_MEDIA_CLEANUP_BATCH_SIZE = 32;

type WorkerLogger = Pick<typeof defaultLogger, "info" | "warn" | "error">;

export interface MediaCleanupProcessorOptions {
  createClient?: () => ConvexAdminClient;
  createStorage?: () => ObjectStorage;
  now?: () => number;
  logger?: WorkerLogger;
  batchSize?: number;
  intervalMs?: number;
}

const getRetryDelayMs = (attempts: number): number | null =>
  MEDIA_CLEANUP_RETRY_DELAYS_MS[attempts] ?? null;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown cleanup failure";
};

const isRetryableCleanupError = (error: unknown): boolean => {
  if (error instanceof ConfigError) {
    return false;
  }

  if (error instanceof StorageError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /timeout|timed out|temporar|rate limit|throttl|network|503|504|ECONN|ETIMEDOUT|ENOTFOUND/i.test(
    error.message,
  );
};

const processCleanupJob = async (
  client: ConvexAdminClient,
  storage: ObjectStorage,
  jobId: string,
  now: number,
  logger: WorkerLogger,
): Promise<"completed" | "retried" | "failed" | "skipped"> => {
  const job = await client.mutation(convexInternal.mediaCleanup.claimJob, {
    jobId: jobId as never,
    now,
  });

  if (!job) {
    return "skipped";
  }

  try {
    await storage.deleteObject(job.objectKey);
    await client.mutation(convexInternal.mediaCleanup.markJobCompleted, {
      jobId: job._id,
      now,
    });
    return "completed";
  } catch (error) {
    const lastError = getErrorMessage(error);
    const retryDelayMs = isRetryableCleanupError(error) ? getRetryDelayMs(job.attempts) : null;

    if (retryDelayMs !== null) {
      await client.mutation(convexInternal.mediaCleanup.markJobRetry, {
        jobId: job._id,
        now,
        nextAttemptAt: now + retryDelayMs,
        lastError,
      });
      logger.warn({ jobId: job._id, objectKey: job.objectKey, lastError }, "media cleanup job scheduled for retry");
      return "retried";
    }

    await client.mutation(convexInternal.mediaCleanup.markJobFailed, {
      jobId: job._id,
      now,
      lastError,
    });
    logger.error({ jobId: job._id, objectKey: job.objectKey, lastError }, "media cleanup job failed");
    return "failed";
  }
};

export interface MediaCleanupTickResult {
  expiredUploadCount: number;
  completedJobs: number;
  retriedJobs: number;
  failedJobs: number;
  skippedJobs: number;
}

export const createMediaCleanupProcessor = (options: MediaCleanupProcessorOptions = {}) => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const createStorage = options.createStorage ?? createR2Storage;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? defaultLogger;
  const batchSize = options.batchSize ?? DEFAULT_MEDIA_CLEANUP_BATCH_SIZE;
  const intervalMs = options.intervalMs ?? DEFAULT_MEDIA_CLEANUP_INTERVAL_MS;

  const runTick = async (): Promise<MediaCleanupTickResult> => {
    const client = createClient();
    const storage = createStorage();
    const tickNow = now();

    const expiredUploadIds = await client.mutation(convexInternal.mediaCleanup.expirePendingUploadsBatch, {
      now: tickNow,
      limit: batchSize,
    });
    const pendingJobIds = await client.query(convexInternal.mediaCleanup.listDueJobIds, {
      status: "pending",
      now: tickNow,
      limit: batchSize,
    });
    const remainingAfterPending = Math.max(0, batchSize - pendingJobIds.length);
    const staleProcessingJobIds =
      remainingAfterPending > 0
        ? await client.query(convexInternal.mediaCleanup.listDueJobIds, {
            status: "processing",
            now: tickNow,
            limit: remainingAfterPending,
          })
        : [];
    const remainingAfterProcessing = Math.max(0, remainingAfterPending - staleProcessingJobIds.length);
    const retryJobIds =
      remainingAfterProcessing > 0
        ? await client.query(convexInternal.mediaCleanup.listDueJobIds, {
            status: "retry",
            now: tickNow,
            limit: remainingAfterProcessing,
          })
        : [];

    const results: MediaCleanupTickResult = {
      expiredUploadCount: expiredUploadIds.length,
      completedJobs: 0,
      retriedJobs: 0,
      failedJobs: 0,
      skippedJobs: 0,
    };

    for (const jobId of [...pendingJobIds, ...staleProcessingJobIds, ...retryJobIds].slice(0, batchSize)) {
      const outcome = await processCleanupJob(client, storage, jobId, tickNow, logger);
      switch (outcome) {
        case "completed":
          results.completedJobs += 1;
          break;
        case "retried":
          results.retriedJobs += 1;
          break;
        case "failed":
          results.failedJobs += 1;
          break;
        default:
          results.skippedJobs += 1;
      }
    }

    if (
      results.expiredUploadCount > 0 ||
      results.completedJobs > 0 ||
      results.retriedJobs > 0 ||
      results.failedJobs > 0
    ) {
      logger.info(results, "media cleanup tick processed");
    }

    return results;
  };

  const start = () => {
    let stopped = false;
    let running = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const logTickFailure = (error: unknown) => {
      logger.error({ error: getErrorMessage(error) }, "media cleanup tick failed");
    };

    const scheduleNext = () => {
      if (stopped) {
        return;
      }

      const executeScheduledTick = async () => {
        let acquiredRunning = false;
        let shouldReschedule = false;

        try {
          shouldReschedule = true;
          if (running) {
            return;
          }

          running = true;
          acquiredRunning = true;
          await runTick();
        } catch (error) {
          logTickFailure(error);
        } finally {
          if (acquiredRunning) {
            running = false;
          }

          if (shouldReschedule) {
            try {
              scheduleNext();
            } catch (error) {
              logTickFailure(error);
            }
          }
        }
      };

      timeoutId = setTimeout(() => {
        void executeScheduledTick();
      }, intervalMs);
    };

    scheduleNext();

    return () => {
      stopped = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  };

  return {
    runTick,
    start,
  };
};
