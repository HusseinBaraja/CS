import { logger as defaultLogger } from '@cs/core';
import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import { canonicalizePhoneNumber, formatOwnerNotification, type ConversationMessageDto } from '@cs/shared';

const DEFAULT_PENDING_ASSISTANT_RECONCILIATION_INTERVAL_MS = 60_000;
const DEFAULT_PENDING_ASSISTANT_RECONCILIATION_BATCH_SIZE = 50;
const DEFAULT_PENDING_ASSISTANT_GRACE_PERIOD_MS = 15_000;

type WorkerLogger = Pick<typeof defaultLogger, "info" | "error">;
type OwnerNotificationSender = (input: { recipientJid: string; text: string }) => Promise<void>;
type AssistantHandoffSource = "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback";

export interface PendingAssistantReconciliationProcessorOptions {
  batchSize?: number;
  createClient?: () => ConvexAdminClient;
  gracePeriodMs?: number;
  intervalMs?: number;
  logger?: WorkerLogger;
  now?: () => number;
  sendOwnerNotification?: OwnerNotificationSender;
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

const getAnalyticsIdempotencyKey = (pendingMessageId: string): string =>
  `pendingMessage:${pendingMessageId}:handoff_started`;

const isAssistantHandoffSource = (value: string): value is AssistantHandoffSource =>
  value === "assistant_action"
  || value === "provider_failure_fallback"
  || value === "invalid_model_output_fallback";

const OWNER_HANDOFF_HISTORY_LIMIT = 6;

const reconcilePendingAssistantMessage = async (
  client: ConvexAdminClient,
  candidate: {
    companyId: string;
    conversationId: string;
    messageId: string;
    phoneNumber: string;
    analyticsState?: "pending" | "recorded" | "completed" | "not_applicable";
    ownerNotificationState?: "pending" | "sent" | "completed" | "not_applicable";
  },
  logger: WorkerLogger,
  now: number,
  sendOwnerNotification?: OwnerNotificationSender,
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

    if (!message || message.deliveryState !== "pending" || message.providerAcknowledgedAt === undefined) {
      return "skipped";
    }

    await client.mutation(convexInternal.conversations.commitPendingAssistantMessage, {
      companyId: candidate.companyId as never,
      conversationId: candidate.conversationId as never,
      pendingMessageId: candidate.messageId as never,
    });

    if ((message.analyticsState === "pending" || message.analyticsState === "recorded") && message.handoffSource) {
      if (message.analyticsState === "pending") {
        await client.mutation(convexInternal.analytics.recordEvent, {
          companyId: candidate.companyId as never,
          eventType: "handoff_started",
          timestamp: message.timestamp,
          idempotencyKey: getAnalyticsIdempotencyKey(candidate.messageId),
          payload: {
            conversationId: candidate.conversationId,
            phoneNumber: candidate.phoneNumber,
            source: message.handoffSource,
          },
        });
        await client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
          companyId: candidate.companyId as never,
          conversationId: candidate.conversationId as never,
          pendingMessageId: candidate.messageId as never,
          analyticsRecorded: true,
        });
      }

      await client.mutation(convexInternal.conversations.completePendingAssistantSideEffects, {
        companyId: candidate.companyId as never,
        conversationId: candidate.conversationId as never,
        pendingMessageId: candidate.messageId as never,
        analyticsCompleted: true,
      });
    }

    if (message.ownerNotificationState === "pending" || message.ownerNotificationState === "sent") {
      if (!message.handoffSource || !isAssistantHandoffSource(message.handoffSource)) {
        throw new Error("Pending assistant owner notification replay requires message.handoffSource");
      }

      if (message.ownerNotificationState === "pending") {
        if (!sendOwnerNotification) {
          throw new Error("Pending assistant owner notification sender unavailable");
        }

        const ownerContext = await client.query(convexInternal.conversations.getConversationOwnerNotificationContext, {
          companyId: candidate.companyId as never,
          conversationId: candidate.conversationId as never,
        });
        const recentMessages = await client.query(convexInternal.conversations.listConversationMessages, {
          companyId: candidate.companyId as never,
          conversationId: candidate.conversationId as never,
          limit: OWNER_HANDOFF_HISTORY_LIMIT,
        }) as ConversationMessageDto[];
        const ownerPhoneNumber = ownerContext ? canonicalizePhoneNumber(ownerContext.ownerPhone) : null;

        if (!ownerContext || !ownerPhoneNumber) {
          throw new Error("Owner notification replay context unavailable");
        }

        await sendOwnerNotification({
          recipientJid: `${ownerPhoneNumber}@s.whatsapp.net`,
          text: formatOwnerNotification({
            companyName: ownerContext.companyName,
            customerPhoneNumber: candidate.phoneNumber,
            history: recentMessages,
            source: message.handoffSource,
          }),
        });
        await client.mutation(convexInternal.conversations.recordPendingAssistantSideEffectProgress, {
          companyId: candidate.companyId as never,
          conversationId: candidate.conversationId as never,
          pendingMessageId: candidate.messageId as never,
          ownerNotificationSent: true,
        });
      }

      await client.mutation(convexInternal.conversations.completePendingAssistantSideEffects, {
        companyId: candidate.companyId as never,
        conversationId: candidate.conversationId as never,
        pendingMessageId: candidate.messageId as never,
        ownerNotificationCompleted: true,
      });
    }

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
  const sendOwnerNotification = options.sendOwnerNotification;

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
          ...(candidate.analyticsState ? { analyticsState: candidate.analyticsState } : {}),
          ...(candidate.ownerNotificationState ? { ownerNotificationState: candidate.ownerNotificationState } : {}),
        }, logger, candidateNow, sendOwnerNotification);
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
