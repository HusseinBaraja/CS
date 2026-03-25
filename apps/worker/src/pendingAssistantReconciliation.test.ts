import { describe, expect, test } from 'bun:test';
import { createPendingAssistantReconciliationProcessor } from './pendingAssistantReconciliation';

type StubCall = {
  reference: unknown;
  args: unknown;
};

type LoggerCall = {
  payload: Record<string, unknown>;
  message: string;
};

const createClientStub = (overrides: Partial<{
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  query: (reference: unknown, args: unknown) => Promise<unknown>;
}> = {}) => {
  const calls: { mutations: StubCall[]; queries: StubCall[] } = {
    mutations: [],
    queries: [],
  };

  return {
    client: {
      mutation: async (reference: unknown, args: unknown) => {
        calls.mutations.push({ reference, args });
        return overrides.mutation?.(reference, args);
      },
      query: async (reference: unknown, args: unknown) => {
        calls.queries.push({ reference, args });
        return overrides.query?.(reference, args);
      },
    },
    calls,
  };
};

const createLoggerStub = () => {
  const infoCalls: LoggerCall[] = [];
  const errorCalls: LoggerCall[] = [];

  const captureCall = (calls: LoggerCall[], args: unknown[]) => {
    const [payload = {}, message = ""] = args;
    calls.push({
      payload: (payload ?? {}) as Record<string, unknown>,
      message: typeof message === "string" ? message : String(message),
    });
  };

  return {
    logger: {
      info: (...args: unknown[]) => {
        captureCall(infoCalls, args);
      },
      error: (...args: unknown[]) => {
        captureCall(errorCalls, args);
      },
    },
    infoCalls,
    errorCalls,
  };
};

describe("createPendingAssistantReconciliationProcessor", () => {
  test("reconciles stale pending assistant messages", async () => {
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as { key?: string; ownerToken?: string };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }
        return undefined;
      },
      query: async (_reference, args) => {
        const input = args as { olderThanOrAt?: number; limit?: number; messageId?: string };
        if (typeof input.olderThanOrAt === "number") {
          return [{
            companyId: "company-1",
            conversationId: "conversation-1",
            messageId: "message-1",
            phoneNumber: "967700000001",
            timestamp: 1_000,
            analyticsState: "not_applicable",
            ownerNotificationState: "not_applicable",
          }];
        }

        if (input.messageId === "message-1") {
          return {
            id: "message-1",
            conversationId: "conversation-1",
            role: "assistant",
            content: "Assistant reply",
            timestamp: 1_000,
            deliveryState: "pending",
            providerAcknowledgedAt: 1_500,
            analyticsState: "not_applicable",
            ownerNotificationState: "not_applicable",
          };
        }

        return null;
      },
    });
    const { logger, infoCalls, errorCalls } = createLoggerStub();
    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      logger,
      now: () => 20_000,
      gracePeriodMs: 5_000,
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(calls.queries[0]?.args).toEqual({
      olderThanOrAt: 15_000,
      limit: 50,
    });
    expect(calls.mutations.some((call) => {
      const args = call.args as Record<string, unknown>;
      return args.pendingMessageId === "message-1" && args.conversationId === "conversation-1";
    })).toBe(true);
    expect(infoCalls).toEqual([{
      payload: {
        reconciledCount: 1,
        skippedCount: 0,
        failedCount: 0,
      },
      message: "pending assistant reconciliation tick processed",
    }]);
    expect(errorCalls).toEqual([]);
  });

  test("skips messages that are no longer pending after reload", async () => {
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as { key?: string; ownerToken?: string };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }
        return undefined;
      },
      query: async (_reference, args) => {
        const input = args as { olderThanOrAt?: number; messageId?: string };
        if (typeof input.olderThanOrAt === "number") {
          return [{
            companyId: "company-1",
            conversationId: "conversation-1",
            messageId: "message-1",
            phoneNumber: "967700000001",
            timestamp: 1_000,
            analyticsState: "not_applicable",
            ownerNotificationState: "not_applicable",
          }];
        }

        return {
          id: "message-1",
          conversationId: "conversation-1",
          role: "assistant",
          content: "Assistant reply",
          timestamp: 1_000,
          deliveryState: "sent",
          providerAcknowledgedAt: 1_500,
        };
      },
    });

    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      logger: createLoggerStub().logger,
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 0,
      skippedCount: 1,
      failedCount: 0,
    });
  });

  test("continues processing after a reconciliation failure", async () => {
    let commitAttempts = 0;
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as { key?: string; ownerToken?: string; pendingMessageId?: string };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }

        if (input.pendingMessageId) {
          commitAttempts += 1;
          if (commitAttempts === 1) {
            throw new Error("commit failed");
          }
        }

        return undefined;
      },
      query: async (_reference, args) => {
        const input = args as { olderThanOrAt?: number; messageId?: string };
        if (typeof input.olderThanOrAt === "number") {
          return [
            {
              companyId: "company-1",
              conversationId: "conversation-1",
              messageId: "message-1",
              phoneNumber: "967700000001",
              timestamp: 1_000,
              analyticsState: "not_applicable",
              ownerNotificationState: "not_applicable",
            },
            {
              companyId: "company-1",
              conversationId: "conversation-2",
              messageId: "message-2",
              phoneNumber: "967700000002",
              timestamp: 1_500,
              analyticsState: "not_applicable",
              ownerNotificationState: "not_applicable",
            },
          ];
        }

        return {
          id: input.messageId,
          conversationId: input.messageId === "message-1" ? "conversation-1" : "conversation-2",
          role: "assistant",
          content: "Assistant reply",
          timestamp: 1_000,
          deliveryState: "pending",
          providerAcknowledgedAt: 1_500,
          analyticsState: "not_applicable",
          ownerNotificationState: "not_applicable",
        };
      },
    });
    const { logger, errorCalls, infoCalls } = createLoggerStub();
    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      logger,
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 1,
      skippedCount: 0,
      failedCount: 1,
    });

    expect(errorCalls[0]).toEqual({
      payload: {
        companyId: "company-1",
        conversationId: "conversation-1",
        error: "commit failed",
        messageId: "message-1",
      },
      message: "pending assistant reconciliation failed",
    });
    expect(infoCalls).toEqual([{
      payload: {
        reconciledCount: 1,
        skippedCount: 0,
        failedCount: 1,
      },
      message: "pending assistant reconciliation tick processed",
    }]);
  });

  test("skips unacknowledged pending messages", async () => {
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as { key?: string; ownerToken?: string };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }
        return undefined;
      },
      query: async (_reference, args) => {
        const input = args as { olderThanOrAt?: number; messageId?: string };
        if (typeof input.olderThanOrAt === "number") {
          return [{
            companyId: "company-1",
            conversationId: "conversation-1",
            messageId: "message-1",
            phoneNumber: "967700000001",
            timestamp: 1_000,
            analyticsState: "not_applicable",
            ownerNotificationState: "not_applicable",
          }];
        }

        return {
          id: "message-1",
          conversationId: "conversation-1",
          role: "assistant",
          content: "Assistant reply",
          timestamp: 1_000,
          deliveryState: "pending",
          analyticsState: "not_applicable",
          ownerNotificationState: "not_applicable",
        };
      },
    });

    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      logger: createLoggerStub().logger,
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 0,
      skippedCount: 1,
      failedCount: 0,
    });
  });

  test("replays analytics and owner notification side effects when a sender is provided", async () => {
    const sentNotifications: Array<{ recipientJid: string; text: string }> = [];
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as {
          key?: string;
          ownerToken?: string;
          pendingMessageId?: string;
          eventType?: string;
          idempotencyKey?: string;
          analyticsRecorded?: boolean;
          ownerNotificationSent?: boolean;
          analyticsCompleted?: boolean;
          ownerNotificationCompleted?: boolean;
        };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }
        if (input.eventType === "handoff_started") {
          return undefined;
        }
        if (
          input.pendingMessageId
          && (
            input.analyticsRecorded
            || input.ownerNotificationSent
            || input.analyticsCompleted
            || input.ownerNotificationCompleted
          )
        ) {
          return undefined;
        }
        return undefined;
      },
      query: async (_reference, args) => {
        const input = args as { olderThanOrAt?: number; messageId?: string; ownerPhone?: string; limit?: number };
        if (typeof input.olderThanOrAt === "number") {
          return [{
            companyId: "company-1",
            conversationId: "conversation-1",
            messageId: "message-1",
            phoneNumber: "967700000001",
            timestamp: 1_000,
            analyticsState: "pending",
            ownerNotificationState: "pending",
          }];
        }
        if (input.messageId === "message-1") {
          return {
            id: "message-1",
            conversationId: "conversation-1",
            role: "assistant",
            content: "Assistant reply",
            timestamp: 1_000,
            deliveryState: "pending",
            providerAcknowledgedAt: 1_500,
            handoffSource: "assistant_action",
            analyticsState: "pending",
            ownerNotificationState: "pending",
          };
        }
        if (typeof input.limit === "number") {
          return [{
            id: "assistant-sent-1",
            conversationId: "conversation-1",
            role: "assistant",
            content: "Assistant reply",
            timestamp: 1_000,
            deliveryState: "sent",
          }];
        }
        return {
          companyName: "Tenant A",
          ownerPhone: "966500000000",
        };
      },
    });

    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      logger: createLoggerStub().logger,
      sendOwnerNotification: async (input) => {
        sentNotifications.push(input);
      },
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(sentNotifications).toEqual([{
      recipientJid: "966500000000@s.whatsapp.net",
      text: expect.stringContaining("Handoff started for Tenant A."),
    }]);
    expect(calls.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        args: expect.objectContaining({
          eventType: "handoff_started",
          idempotencyKey: "pendingMessage:message-1:handoff_started",
        }),
      }),
      expect.objectContaining({
        args: expect.objectContaining({
          pendingMessageId: "message-1",
          analyticsRecorded: true,
        }),
      }),
      expect.objectContaining({
        args: expect.objectContaining({
          pendingMessageId: "message-1",
          ownerNotificationSent: true,
        }),
      }),
    ]));
  });

  test("completes already-recorded side effects without replaying them", async () => {
    const sentNotifications: Array<{ recipientJid: string; text: string }> = [];
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as {
          key?: string;
          ownerToken?: string;
          pendingMessageId?: string;
          analyticsCompleted?: boolean;
          ownerNotificationCompleted?: boolean;
        };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }
        if (input.pendingMessageId && (input.analyticsCompleted || input.ownerNotificationCompleted)) {
          return undefined;
        }
        return undefined;
      },
      query: async (_reference, args) => {
        const input = args as { olderThanOrAt?: number; messageId?: string };
        if (typeof input.olderThanOrAt === "number") {
          return [{
            companyId: "company-1",
            conversationId: "conversation-1",
            messageId: "message-1",
            phoneNumber: "967700000001",
            timestamp: 1_000,
            analyticsState: "recorded",
            ownerNotificationState: "sent",
          }];
        }
        if (input.messageId === "message-1") {
          return {
            id: "message-1",
            conversationId: "conversation-1",
            role: "assistant",
            content: "Assistant reply",
            timestamp: 1_000,
            deliveryState: "pending",
            providerAcknowledgedAt: 1_500,
            handoffSource: "assistant_action",
            analyticsState: "recorded",
            ownerNotificationState: "sent",
          };
        }
        throw new Error("should not load owner replay context");
      },
    });

    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      logger: createLoggerStub().logger,
      sendOwnerNotification: async (input) => {
        sentNotifications.push(input);
      },
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(sentNotifications).toEqual([]);
    expect(calls.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        args: expect.objectContaining({
          pendingMessageId: "message-1",
          analyticsCompleted: true,
        }),
      }),
      expect.objectContaining({
        args: expect.objectContaining({
          pendingMessageId: "message-1",
          ownerNotificationCompleted: true,
        }),
      }),
    ]));
  });
});
