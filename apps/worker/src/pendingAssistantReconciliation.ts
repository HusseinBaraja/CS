import { logger as defaultLogger } from '@cs/core';
import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';

const DEFAULT_PENDING_ASSISTANT_RECONCILIATION_INTERVAL_MS = 60_000;
const DEFAULT_PENDING_ASSISTANT_RECONCILIATION_BATCH_SIZE = 50;
const DEFAULT_PENDING_ASSISTANT_GRACE_PERIOD_MS = 15_000;
const CONVERSATION_LOCK_LEASE_MS = 1_000;

type WorkerLogger = Pick<typeof defaultLogger, "info" | "error">;

export interface PendingAssistantReconciliationProcessorOptions {
  batchSize?: number;
  createClient?: () => ConvexAdminClient;
  gracePeriodMs?: number;
  intervalMs?: number;
  logger?: WorkerLogger;
  now?: () => number;
}

export interface PendingAssistantReconciliationTickResult {
  reconciledCount: number;
  skippedCount: number;
  failedCount: number;
}

const getConversationLockKey = (companyId: string, phoneNumber: string): string =>
  `conversation:${companyId}:${phoneNumber}`;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reconcilePendingAssistantMessage = async (
  client: ConvexAdminClient,
  candidate: {
    companyId: string;
    conversationId: string;
    messageId: string;
    phoneNumber: string;
  },
  logger: WorkerLogger,
  now: number,
): Promise<"reconciled" | "skipped"> => {
  const ownerToken = crypto.randomUUID();
  const key = getConversationLockKey(candidate.companyId, candidate.phoneNumber);
  const acquisition = await client.mutation(convexInternal.conversations.acquireConversationLock, {
    key,
    now,
    ownerToken,
  });

  if (!acquisition.acquired) {
    return "skipped";
  }

  try {
    const message = await client.query(convexInternal.conversations.getConversationMessage, {
      companyId: candidate.companyId as never,
      conversationId: candidate.conversationId as never,
      messageId: candidate.messageId as never,
    });

    if (!message || message.deliveryState !== "pending") {
      return "skipped";
    }

    await client.mutation(convexInternal.conversations.commitPendingAssistantMessage, {
      companyId: candidate.companyId as never,
      conversationId: candidate.conversationId as never,
      pendingMessageId: candidate.messageId as never,
    });

    return "reconciled";
  } finally {
    try {
      await client.mutation(convexInternal.conversations.releaseConversationLock, {
        key,
        ownerToken,
      });
    } catch (error) {
      logger.error(
        {
          companyId: candidate.companyId,
          conversationId: candidate.conversationId,
          error: getErrorMessage(error),
          messageId: candidate.messageId,
        },
        "pending assistant reconciliation lock release failed",
      );
    }
  }
};

export const createPendingAssistantReconciliationProcessor = (
  options: PendingAssistantReconciliationProcessorOptions = {},
) => {
  const batchSize = options.batchSize ?? DEFAULT_PENDING_ASSISTANT_RECONCILIATION_BATCH_SIZE;
  const createClient = options.createClient ?? createConvexAdminClient;
  const gracePeriodMs = options.gracePeriodMs ?? DEFAULT_PENDING_ASSISTANT_GRACE_PERIOD_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_PENDING_ASSISTANT_RECONCILIATION_INTERVAL_MS;
  const logger = options.logger ?? defaultLogger;
  const now = options.now ?? Date.now;

  const runTick = async (): Promise<PendingAssistantReconciliationTickResult> => {
    const client = createClient();
    const tickNow = now();
    const candidates = await client.query(convexInternal.conversations.listPendingAssistantMessages, {
      olderThanOrAt: tickNow - gracePeriodMs,
      limit: batchSize,
    });

    const result: PendingAssistantReconciliationTickResult = {
      reconciledCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    for (const candidate of candidates) {
      try {
        const candidateNow = now();
        const outcome = await reconcilePendingAssistantMessage(client, {
          companyId: candidate.companyId,
          conversationId: candidate.conversationId,
          messageId: candidate.messageId,
          phoneNumber: candidate.phoneNumber,
        }, logger, candidateNow);
        if (outcome === "reconciled") {
          result.reconciledCount += 1;
        } else {
          result.skippedCount += 1;
        }
      } catch (error) {
        result.failedCount += 1;
        logger.error(
          {
            companyId: candidate.companyId,
            conversationId: candidate.conversationId,
            error: getErrorMessage(error),
            messageId: candidate.messageId,
          },
          "pending assistant reconciliation failed",
        );
      }
    }

    if (result.reconciledCount > 0 || result.failedCount > 0) {
      logger.info(result, "pending assistant reconciliation tick processed");
    }

    return result;
  };

  const start = () => {
    let stopped = false;
    let running = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const logTickFailure = (error: unknown) => {
      logger.error({ error: getErrorMessage(error) }, "pending assistant reconciliation tick failed");
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
