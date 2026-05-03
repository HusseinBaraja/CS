import {
  type ConversationSessionLogWriter,
  logger as defaultLogger,
} from '@cs/core';
import {
  type ConvexAdminClient,
  convexInternal,
  createConvexAdminClient,
  toCompanyId,
  toConversationId,
  toMessageId,
} from '@cs/db';
import {
  type AnalyticsHandoffState,
  isSamePhoneNumber,
  type OwnerNotificationHandoffState,
} from '@cs/shared';
import {
  appendAssistantReconciledSessionLog,
} from './pendingAssistantSessionLog';
import {
  replayPendingAssistantAnalyticsIfNeeded,
  replayPendingAssistantOwnerNotificationIfNeeded,
} from './pendingAssistantSideEffectsReplay';
import {
  logWorkerItemFailed,
  logWorkerTickCompleted,
  logWorkerTickFailed,
  type WorkerLogger,
  withWorkerJobLogger,
} from './logging';
import { getConversationLockKey, withConversationLock } from './conversationLock';

const DEFAULT_PENDING_ASSISTANT_RECONCILIATION_INTERVAL_MS = 60_000;
const DEFAULT_PENDING_ASSISTANT_RECONCILIATION_BATCH_SIZE = 50;
const DEFAULT_PENDING_ASSISTANT_GRACE_PERIOD_MS = 15_000;
const JOB_NAME = "pendingAssistantReconciliation";
type OwnerNotificationSender = (input: { recipientJid: string; text: string }) => Promise<void>;

interface PendingAssistantReconciliationProcessorOptions {
  batchSize?: number;
  conversationSessionLog?: ConversationSessionLogWriter;
  createClient?: () => ConvexAdminClient;
  gracePeriodMs?: number;
  intervalMs?: number;
  logger?: WorkerLogger;
  now?: () => number;
  sendOwnerNotification?: OwnerNotificationSender;
}

interface PendingAssistantReconciliationTickResult {
  reconciledCount: number;
  skippedCount: number;
  failedCount: number;
}

const reconcilePendingAssistantMessage = async (
  client: ConvexAdminClient,
  candidate: {
    companyId: string;
    conversationId: string;
    messageId: string;
    phoneNumber: string;
    analyticsState?: AnalyticsHandoffState;
    ownerNotificationState?: OwnerNotificationHandoffState;
  },
  logger: WorkerLogger,
  now: number,
  conversationSessionLog: ConversationSessionLogWriter | undefined,
  sendOwnerNotification?: OwnerNotificationSender,
): Promise<"reconciled" | "skipped"> => {
  const key = getConversationLockKey(candidate.companyId, candidate.phoneNumber);
  return withConversationLock({
    client,
    context: {
      jobName: JOB_NAME,
      companyId: candidate.companyId,
      conversationId: candidate.conversationId,
      messageId: candidate.messageId,
    },
    key,
    logger,
    now,
    releaseFailureMessage: "pending assistant reconciliation lock release failed",
    run: async () => {
      const message = await client.query(convexInternal.conversations.getConversationMessage, {
        companyId: candidate.companyId as never,
        conversationId: candidate.conversationId as never,
        messageId: candidate.messageId as never,
      });

      if (!message || message.deliveryState !== "pending" || message.providerAcknowledgedAt === undefined) {
        return "skipped";
      }
  try {
    const message = await client.query(convexInternal.conversations.getConversationMessage, {
      companyId: toCompanyId(candidate.companyId),
      conversationId: toConversationId(candidate.conversationId),
      messageId: toMessageId(candidate.messageId),
    });

      const conversationOwnerContext = conversationSessionLog && process.env.NODE_ENV !== "production"
        ? await client.query(convexInternal.conversations.getConversationOwnerNotificationContext, {
          companyId: candidate.companyId as never,
          conversationId: candidate.conversationId as never,
        })
        : undefined;
      const ownerConversationSessionLog = conversationOwnerContext
        && isSamePhoneNumber(candidate.phoneNumber, conversationOwnerContext.ownerPhone)
        ? conversationSessionLog
        : undefined;

      await client.mutation(convexInternal.conversations.commitPendingAssistantMessage, {
        companyId: candidate.companyId as never,
        conversationId: candidate.conversationId as never,
        pendingMessageId: candidate.messageId as never,
      });
      await appendAssistantReconciledSessionLog(ownerConversationSessionLog, {
        companyId: candidate.companyId,
        conversationId: candidate.conversationId,
        timestamp: message.timestamp,
      });
    const conversationOwnerContext = conversationSessionLog && process.env.NODE_ENV !== "production"
      ? await client.query(convexInternal.conversations.getConversationOwnerNotificationContext, {
        companyId: toCompanyId(candidate.companyId),
        conversationId: toConversationId(candidate.conversationId),
      })
      : undefined;
    const ownerConversationSessionLog = conversationOwnerContext
      && isSamePhoneNumber(candidate.phoneNumber, conversationOwnerContext.ownerPhone)
      ? conversationSessionLog
      : undefined;

    await client.mutation(convexInternal.conversations.commitPendingAssistantMessage, {
      companyId: toCompanyId(candidate.companyId),
      conversationId: toConversationId(candidate.conversationId),
      pendingMessageId: toMessageId(candidate.messageId),
    });
    await appendAssistantReconciledSessionLog(ownerConversationSessionLog, {
      companyId: candidate.companyId,
      conversationId: candidate.conversationId,
      timestamp: message.timestamp,
    });

      await replayPendingAssistantAnalyticsIfNeeded(client, {
        companyId: candidate.companyId,
        conversationId: candidate.conversationId,
        conversationSessionLog: ownerConversationSessionLog,
        handoffSource: message.handoffSource,
        messageId: candidate.messageId,
        phoneNumber: candidate.phoneNumber,
        timestamp: message.timestamp,
        analyticsState: message.analyticsState,
      });

      await replayPendingAssistantOwnerNotificationIfNeeded(client, {
        companyId: candidate.companyId,
        conversationId: candidate.conversationId,
        conversationSessionLog: ownerConversationSessionLog,
        handoffSource: message.handoffSource,
        messageId: candidate.messageId,
        ownerContext: conversationOwnerContext,
        ownerNotificationState: message.ownerNotificationState,
        phoneNumber: candidate.phoneNumber,
        timestamp: message.timestamp,
      }, sendOwnerNotification);

      return "reconciled";
    },
  });
};

export const createPendingAssistantReconciliationProcessor = (
  options: PendingAssistantReconciliationProcessorOptions = {},
) => {
  const batchSize = options.batchSize ?? DEFAULT_PENDING_ASSISTANT_RECONCILIATION_BATCH_SIZE;
  const createClient = options.createClient ?? createConvexAdminClient;
  const gracePeriodMs = options.gracePeriodMs ?? DEFAULT_PENDING_ASSISTANT_GRACE_PERIOD_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_PENDING_ASSISTANT_RECONCILIATION_INTERVAL_MS;
  const logger = withWorkerJobLogger(options.logger ?? defaultLogger, JOB_NAME);
  const now = options.now ?? Date.now;
  const conversationSessionLog = options.conversationSessionLog;
  const sendOwnerNotification = options.sendOwnerNotification;

  const runTick = async (): Promise<PendingAssistantReconciliationTickResult> => {
    const startedAt = Date.now();
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
          ...(candidate.analyticsState ? { analyticsState: candidate.analyticsState } : {}),
          ...(candidate.ownerNotificationState ? { ownerNotificationState: candidate.ownerNotificationState } : {}),
        }, logger, candidateNow, conversationSessionLog, sendOwnerNotification);
        if (outcome === "reconciled") {
          result.reconciledCount += 1;
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
            companyId: candidate.companyId,
            conversationId: candidate.conversationId,
            messageId: candidate.messageId,
          },
          "pending assistant reconciliation failed",
        );
      }
    }

    logWorkerTickCompleted(
      logger,
      {
        jobName: JOB_NAME,
        processedCount: result.reconciledCount + result.skippedCount + result.failedCount,
        succeededCount: result.reconciledCount + result.skippedCount,
        failedCount: result.failedCount,
        retryCount: 0,
        durationMs: Date.now() - startedAt,
        reconciledCount: result.reconciledCount,
        skippedCount: result.skippedCount,
      },
      "pending assistant reconciliation tick completed",
    );

    return result;
  };

  const start = () => {
    let stopped = false;
    let running = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const logTickFailure = (error: unknown) => {
      logWorkerTickFailed(
        logger,
        JOB_NAME,
        error,
        0,
        "pending assistant reconciliation tick failed",
      );
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
