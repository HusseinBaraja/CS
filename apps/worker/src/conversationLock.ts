import { type ConvexAdminClient, convexInternal } from '@cs/db';
import { logWorkerItemFailed, type WorkerLogger } from './logging';

type ConversationLockItemContext = {
  jobName: string;
  companyId: string;
  conversationId: string;
  messageId?: string;
};

interface WithConversationLockOptions<T> {
  client: ConvexAdminClient;
  context: ConversationLockItemContext;
  key: string;
  logger: WorkerLogger;
  now: number;
  releaseFailureMessage: string;
  run: () => Promise<T>;
}

export const getConversationLockKey = (companyId: string, phoneNumber: string): string =>
  `conversation:${companyId}:${phoneNumber}`;

export const getConversationAutoResumeLockKey = (conversationId: string): string =>
  `conversation:auto-resume:${conversationId}`;

export const withConversationLock = async <T>({
  client,
  context,
  key,
  logger,
  now,
  releaseFailureMessage,
  run,
}: WithConversationLockOptions<T>): Promise<T | "skipped"> => {
  const ownerToken = crypto.randomUUID();
  const acquisition = await client.mutation(convexInternal.conversations.acquireConversationLock, {
    key,
    now,
    ownerToken,
  });

  if (!acquisition.acquired) {
    return "skipped";
  }

  try {
    return await run();
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
          ...context,
          step: "lock_release",
        },
        releaseFailureMessage,
      );
    }
  }
};
