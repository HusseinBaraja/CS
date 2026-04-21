import { describe, expect, test } from 'bun:test';
import type { ConversationSessionLogWriter } from '@cs/core';
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
  const warnCalls: LoggerCall[] = [];
  const createLogger = (bindings: Record<string, unknown> = {}) => ({
    debug: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      infoCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : {} as Record<string, unknown>,
        message: typeof message === "string" ? message : String(message),
      });
    },
    info: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      infoCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : {} as Record<string, unknown>,
        message: typeof message === "string" ? message : String(message),
      });
    },
    warn: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      warnCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : {} as Record<string, unknown>,
        message: typeof message === "string" ? message : String(message),
      });
    },
    error: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      errorCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : {} as Record<string, unknown>,
        message: typeof message === "string" ? message : String(message),
      });
    },
    child: (childBindings: Record<string, unknown>) => createLogger({ ...bindings, ...childBindings }),
  });

  return {
    logger: createLogger(),
    infoCalls,
    warnCalls,
    errorCalls,
  };
};

const createConversationSessionLog = () => {
  const entries: Array<Parameters<ConversationSessionLogWriter["append"]>[0]> = [];

  return {
    log: {
      append: async (entry) => {
        entries.push(entry);
      },
    } satisfies ConversationSessionLogWriter,
    entries,
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
        event: "worker.job.tick_completed",
        runtime: "worker",
        surface: "job",
        jobName: "pendingAssistantReconciliation",
        outcome: "success",
        processedCount: 1,
        succeededCount: 1,
        retryCount: 0,
        durationMs: expect.any(Number),
        reconciledCount: 1,
        skippedCount: 0,
        failedCount: 0,
      },
      message: "pending assistant reconciliation tick completed",
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
        event: "worker.job.item_failed",
        runtime: "worker",
        surface: "job",
        jobName: "pendingAssistantReconciliation",
        outcome: "failed",
        companyId: "company-1",
        conversationId: "conversation-1",
        error: expect.objectContaining({
          message: "commit failed",
          name: "Error",
        }),
        messageId: "message-1",
      },
      message: "pending assistant reconciliation failed",
    });
    expect(infoCalls).toEqual([{
      payload: {
        event: "worker.job.tick_completed",
        runtime: "worker",
        surface: "job",
        jobName: "pendingAssistantReconciliation",
        outcome: "partial_success",
        processedCount: 2,
        succeededCount: 1,
        retryCount: 0,
        durationMs: expect.any(Number),
        reconciledCount: 1,
        skippedCount: 0,
        failedCount: 1,
      },
      message: "pending assistant reconciliation tick completed",
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
    let mutationCountBeforeSend = 0;
    const { log, entries } = createConversationSessionLog();
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
            phoneNumber: "966500000000",
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
      conversationSessionLog: log,
      logger: createLoggerStub().logger,
      sendOwnerNotification: async (input) => {
        mutationCountBeforeSend = calls.mutations.length;
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
    const ownerNotificationSentMutationIndex = calls.mutations.findIndex((call) =>
      (call.args as { ownerNotificationSent?: boolean }).ownerNotificationSent === true);
    expect(ownerNotificationSentMutationIndex).toBeGreaterThanOrEqual(0);
    expect(ownerNotificationSentMutationIndex).toBeGreaterThanOrEqual(mutationCountBeforeSend);
    expect(entries).toEqual([
      {
        kind: "bts",
        timestamp: 1_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        event: "assistant.reconciled",
        details: "Pending assistant message committed by worker reconciliation",
      },
      {
        kind: "bts",
        timestamp: 1_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        event: "assistant.analytics_replayed",
        details: "Handoff analytics recorded by worker reconciliation",
      },
      {
        kind: "bts",
        timestamp: 1_000,
        companyId: "company-1",
        conversationId: "conversation-1",
        event: "assistant.owner_notification_replayed",
        details: "Owner handoff notification replayed by worker reconciliation",
      },
    ]);
  });

  test("continues side effects when session log append fails", async () => {
    const sentNotifications: Array<{ recipientJid: string; text: string }> = [];
    const failingLog: ConversationSessionLogWriter = {
      append: async () => {
        throw new Error("session log write failed");
      },
    };
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as {
          key?: string;
          ownerToken?: string;
          pendingMessageId?: string;
          eventType?: string;
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
        const input = args as { olderThanOrAt?: number; messageId?: string; limit?: number };
        if (typeof input.olderThanOrAt === "number") {
          return [{
            companyId: "company-1",
            conversationId: "conversation-1",
            messageId: "message-1",
            phoneNumber: "966500000000",
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
      conversationSessionLog: failingLog,
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

  test("skips worker session log entries for non-owner conversations", async () => {
    const { log, entries } = createConversationSessionLog();
    const { client } = createClientStub({
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

        return {
          companyName: "Tenant A",
          ownerPhone: "966500000000",
        };
      },
    });
    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      conversationSessionLog: log,
      logger: createLoggerStub().logger,
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(entries).toEqual([]);
  });

  test("skips eager owner context query in production session-log mode", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { log } = createConversationSessionLog();
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

          throw new Error("unexpected owner context query");
        },
      });
      const processor = createPendingAssistantReconciliationProcessor({
        createClient: () => client as never,
        conversationSessionLog: log,
        logger: createLoggerStub().logger,
      });

      await expect(processor.runTick()).resolves.toEqual({
        reconciledCount: 1,
        skippedCount: 0,
        failedCount: 0,
      });

      const ownerContextQueryCount = calls.queries.filter((call) => {
        const args = call.args as { olderThanOrAt?: number; messageId?: string; limit?: number };
        return typeof args.olderThanOrAt !== "number"
          && args.messageId === undefined
          && args.limit === undefined;
      }).length;
      expect(ownerContextQueryCount).toBe(0);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  test("completes already-recorded side effects without handoff source", async () => {
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

  test("fails reconciliation when pending analytics lacks handoff source", async () => {
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as {
          key?: string;
          ownerToken?: string;
          pendingMessageId?: string;
          analyticsCompleted?: boolean;
        };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }
        if (input.pendingMessageId && input.analyticsCompleted) {
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
            analyticsState: "pending",
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
            analyticsState: "pending",
            ownerNotificationState: "not_applicable",
          };
        }
        throw new Error("should not query owner replay context");
      },
    });

    const processor = createPendingAssistantReconciliationProcessor({
      createClient: () => client as never,
      logger: createLoggerStub().logger,
    });

    await expect(processor.runTick()).resolves.toEqual({
      reconciledCount: 0,
      skippedCount: 0,
      failedCount: 1,
    });

    expect(calls.mutations.some((call) =>
      (call.args as { pendingMessageId?: string; analyticsCompleted?: boolean }).pendingMessageId === "message-1"
      && (call.args as { analyticsCompleted?: boolean }).analyticsCompleted === true)).toBe(false);
  });

  test("completes sent owner notifications even when handoff source is missing", async () => {
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as {
          key?: string;
          ownerToken?: string;
          pendingMessageId?: string;
          ownerNotificationCompleted?: boolean;
        };
        if (input.key && input.ownerToken) {
          return { acquired: true, waitMs: 0 };
        }
        if (input.pendingMessageId && input.ownerNotificationCompleted) {
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
            analyticsState: "not_applicable",
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
            analyticsState: "not_applicable",
            ownerNotificationState: "sent",
          };
        }
        throw new Error("should not load owner replay context");
      },
    });
    const sentNotifications: Array<{ recipientJid: string; text: string }> = [];
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
          ownerNotificationCompleted: true,
        }),
      }),
    ]));
  });
});
