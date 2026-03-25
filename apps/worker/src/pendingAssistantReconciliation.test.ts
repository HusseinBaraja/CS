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
          }];
        }

        return {
          id: "message-1",
          conversationId: "conversation-1",
          role: "assistant",
          content: "Assistant reply",
          timestamp: 1_000,
          deliveryState: "sent",
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
    const { client } = createClientStub({
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
            },
            {
              companyId: "company-1",
              conversationId: "conversation-2",
              messageId: "message-2",
              phoneNumber: "967700000002",
              timestamp: 1_500,
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
});
