import { logger as defaultLogger } from '@cs/core';
import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';

const DEFAULT_AUTO_RESUME_INTERVAL_MS = 60_000;
const DEFAULT_AUTO_RESUME_BATCH_SIZE = 50;

type WorkerLogger = Pick<typeof defaultLogger, "info" | "error">;

export interface ConversationAutoResumeProcessorOptions {
  batchSize?: number;
  createClient?: () => ConvexAdminClient;
  intervalMs?: number;
  logger?: WorkerLogger;
  now?: () => number;
}

export interface ConversationAutoResumeTickResult {
  resumedCount: number;
  skippedCount: number;
  failedCount: number;
}

const getConversationAutoResumeLockKey = (conversationId: string): string =>
  `conversation:auto-resume:${conversationId}`;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
      logger.error(
        {
          companyId: conversation.companyId,
          conversationId: conversation.id,
          error: getErrorMessage(error),
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
  const logger = options.logger ?? defaultLogger;
  const now = options.now ?? Date.now;

  const runTick = async (): Promise<ConversationAutoResumeTickResult> => {
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
        logger.error(
          {
            companyId: conversation.companyId,
            conversationId: conversation.id,
            error: getErrorMessage(error),
          },
          "conversation auto-resume failed",
        );
      }
    }

    if (result.resumedCount > 0 || result.failedCount > 0) {
      logger.info(result, "conversation auto-resume tick processed");
    }

    return result;
  };

  const start = () => {
    let stopped = false;
    let running = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const logTickFailure = (error: unknown) => {
      logger.error({ error: getErrorMessage(error) }, "conversation auto-resume tick failed");
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
