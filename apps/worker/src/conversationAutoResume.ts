import { logger as defaultLogger } from '@cs/core';
import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import {
  logWorkerItemFailed,
  logWorkerTickCompleted,
  logWorkerTickFailed,
  type WorkerLogger,
  withWorkerJobLogger,
} from './logging';

const DEFAULT_AUTO_RESUME_INTERVAL_MS = 60_000;
const DEFAULT_AUTO_RESUME_BATCH_SIZE = 50;
const JOB_NAME = "conversationAutoResume";

interface ConversationAutoResumeProcessorOptions {
  batchSize?: number;
  createClient?: () => ConvexAdminClient;
  intervalMs?: number;
  logger?: WorkerLogger;
  now?: () => number;
}

interface ConversationAutoResumeTickResult {
  resumedCount: number;
  skippedCount: number;
  failedCount: number;
}

const getConversationAutoResumeLockKey = (conversationId: string): string =>
  `conversation:auto-resume:${conversationId}`;

const processConversation = async (
  client: ConvexAdminClient,
  conversation: { id: string; companyId: string; nextAutoResumeAt?: number; muted: boolean },
  logger: WorkerLogger,
  now: number,
): Promise<"resumed" | "skipped"> => {
  const ownerToken = crypto.randomUUID();
  const key = getConversationAutoResumeLockKey(conversation.id);
  const acquisition = await client.mutation(convexInternal.conversations.acquireConversationLock, {
    key,
    now,
    ownerToken,
  });

  if (!acquisition.acquired) {
    return "skipped";
  }

  try {
    const reloaded = await client.query(convexInternal.conversations.getConversation, {
      companyId: conversation.companyId as never,
      conversationId: conversation.id as never,
    });

    if (!reloaded.muted || reloaded.nextAutoResumeAt === undefined || reloaded.nextAutoResumeAt > now) {
      return "skipped";
    }

    await client.mutation(convexInternal.conversations.resumeConversation, {
      companyId: conversation.companyId as never,
      conversationId: conversation.id as never,
      resumedAt: now,
      source: "worker_auto",
    });

    return "resumed";
  } finally {
    try {
      await client.mutation(convexInternal.conversations.releaseConversationLock, {
        key,
        ownerToken,
      });
    } catch (error) {
      logWorkerItemFailed(
        logger,
        error,
        {
          jobName: JOB_NAME,
          companyId: conversation.companyId,
          conversationId: conversation.id,
          step: "lock_release",
        },
        "conversation auto-resume lock release failed",
      );
    }
  }
};

export const createConversationAutoResumeProcessor = (
  options: ConversationAutoResumeProcessorOptions = {},
) => {
  const batchSize = options.batchSize ?? DEFAULT_AUTO_RESUME_BATCH_SIZE;
  const createClient = options.createClient ?? createConvexAdminClient;
  const intervalMs = options.intervalMs ?? DEFAULT_AUTO_RESUME_INTERVAL_MS;
  const logger = withWorkerJobLogger(options.logger ?? defaultLogger, JOB_NAME);
  const now = options.now ?? Date.now;

  const runTick = async (): Promise<ConversationAutoResumeTickResult> => {
    const startedAt = Date.now();
    const client = createClient();
    const tickNow = now();
    const dueConversations = await client.query(convexInternal.conversations.listDueAutoResumeConversations, {
      now: tickNow,
      limit: batchSize,
    });

    const result: ConversationAutoResumeTickResult = {
      resumedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    for (const conversation of dueConversations) {
      try {
        const conversationNow = now();
        const outcome = await processConversation(client, conversation, logger, conversationNow);
        if (outcome === "resumed") {
          result.resumedCount += 1;
        } else {
          result.skippedCount += 1;
        }
      } catch (error) {
        result.failedCount += 1;
        logWorkerItemFailed(
          logger,
          error,
          {
            jobName: JOB_NAME,
            companyId: conversation.companyId,
            conversationId: conversation.id,
          },
          "conversation auto-resume failed",
        );
      }
    }

    logWorkerTickCompleted(
      logger,
      {
        jobName: JOB_NAME,
        processedCount: result.resumedCount + result.skippedCount + result.failedCount,
        succeededCount: result.resumedCount + result.skippedCount,
        failedCount: result.failedCount,
        retryCount: 0,
        durationMs: Date.now() - startedAt,
        resumedCount: result.resumedCount,
        skippedCount: result.skippedCount,
      },
      "conversation auto-resume tick completed",
    );

    return result;
  };

  const start = () => {
    let stopped = false;
    let running = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const logTickFailure = (error: unknown, tickStartedAt: number) => {
      logWorkerTickFailed(
        logger,
        JOB_NAME,
        error,
        Date.now() - tickStartedAt,
        "conversation auto-resume tick failed",
      );
    };

    const scheduleNext = () => {
      if (stopped) {
        return;
      }

      const executeScheduledTick = async () => {
        const tickStartedAt = Date.now();
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
          logTickFailure(error, tickStartedAt);
        } finally {
          if (acquiredRunning) {
            running = false;
          }

          if (shouldReschedule) {
            try {
              scheduleNext();
            } catch (error) {
              logTickFailure(error, tickStartedAt);
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
