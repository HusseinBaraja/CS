import { describe, expect, test } from 'bun:test';
import { createConversationAutoResumeProcessor } from './conversationAutoResume';

type StubCall = {
  reference: unknown;
  args: unknown;
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
  const infoCalls: Array<{ payload: unknown; message: string }> = [];
  const errorCalls: Array<{ payload: unknown; message: string }> = [];

  const captureCall = (
    calls: Array<{ payload: unknown; message: string }>,
    args: unknown[],
  ) => {
    const [payload = {}, message = ""] = args;
    calls.push({
      payload,
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

describe("createConversationAutoResumeProcessor", () => {
  test("resumes due muted conversations", async () => {
    let currentNow = 2_000;
    const { client, calls } = createClientStub({
      query: async (_reference, args) => {
        const input = args as { limit?: number; conversationId?: string };
        if (typeof input.limit === "number") {
          return [{
            id: "conversation-1",
            companyId: "company-1",
            phoneNumber: "967700000001",
            muted: true,
            nextAutoResumeAt: 1_000,
          }];
        }

        return {
          id: "conversation-1",
          companyId: "company-1",
          phoneNumber: "967700000001",
          muted: true,
          nextAutoResumeAt: 1_000,
        };
      },
      mutation: async (_reference, args) => {
        const input = args as { ownerToken?: string };
        if (typeof input.ownerToken === "string" && "key" in (args as Record<string, unknown>) && "now" in (args as Record<string, unknown>)) {
          return {
            acquired: true,
            waitMs: 0,
          };
        }

        return undefined;
      },
    });
    const { logger, infoCalls, errorCalls } = createLoggerStub();
    const processor = createConversationAutoResumeProcessor({
      createClient: () => client as never,
      logger,
      now: () => currentNow++,
    });

    await expect(processor.runTick()).resolves.toEqual({
      resumedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(calls.queries).toHaveLength(2);
    expect(calls.mutations).toHaveLength(3);
    expect(calls.queries[0]?.args).toMatchObject({
      now: 2_000,
    });
    expect(calls.mutations[0]?.args).toMatchObject({
      now: 2_001,
    });
    expect(calls.mutations[1]?.args).toMatchObject({
      resumedAt: 2_001,
    });
    expect(infoCalls).toEqual([{
      payload: {
        resumedCount: 1,
        skippedCount: 0,
        failedCount: 0,
      },
      message: "conversation auto-resume tick processed",
    }]);
    expect(errorCalls).toEqual([]);
  });

  test("skips conversations that are no longer due after reload", async () => {
    let currentNow = 2_000;
    const { client } = createClientStub({
      query: async (_reference, args) => {
        const input = args as { limit?: number };
        if (typeof input.limit === "number") {
          return [{
            id: "conversation-1",
            companyId: "company-1",
            phoneNumber: "967700000001",
            muted: true,
            nextAutoResumeAt: 1_000,
          }];
        }

        return {
          id: "conversation-1",
          companyId: "company-1",
          phoneNumber: "967700000001",
          muted: true,
          nextAutoResumeAt: 5_000,
        };
      },
      mutation: async (_reference, args) => {
        if ("ownerToken" in (args as Record<string, unknown>) && "now" in (args as Record<string, unknown>)) {
          return {
            acquired: true,
            waitMs: 0,
          };
        }

        return undefined;
      },
    });
    const processor = createConversationAutoResumeProcessor({
      createClient: () => client as never,
      logger: createLoggerStub().logger,
      now: () => currentNow++,
    });

    await expect(processor.runTick()).resolves.toEqual({
      resumedCount: 0,
      skippedCount: 1,
      failedCount: 0,
    });
  });

  test("continues processing after a failed conversation resume", async () => {
    let resumeAttempts = 0;
    let currentNow = 2_000;
    const { client, calls } = createClientStub({
      query: async (_reference, args) => {
        const input = args as { limit?: number; conversationId?: string };
        if (typeof input.limit === "number") {
          return [
            {
              id: "conversation-1",
              companyId: "company-1",
              phoneNumber: "967700000001",
              muted: true,
              nextAutoResumeAt: 1_000,
            },
            {
              id: "conversation-2",
              companyId: "company-1",
              phoneNumber: "967700000002",
              muted: true,
              nextAutoResumeAt: 1_000,
            },
          ];
        }

        return {
          id: input.conversationId,
          companyId: "company-1",
          phoneNumber: "967700000001",
          muted: true,
          nextAutoResumeAt: 1_000,
        };
      },
      mutation: async (_reference, args) => {
        if ("ownerToken" in (args as Record<string, unknown>) && "now" in (args as Record<string, unknown>)) {
          return {
            acquired: true,
            waitMs: 0,
          };
        }

        if ("source" in (args as Record<string, unknown>)) {
          resumeAttempts += 1;
          if (resumeAttempts === 1) {
            throw new Error("resume failed");
          }
        }

        return undefined;
      },
    });
    const { logger, errorCalls } = createLoggerStub();
    const processor = createConversationAutoResumeProcessor({
      createClient: () => client as never,
      logger,
      now: () => currentNow++,
    });

    await expect(processor.runTick()).resolves.toEqual({
      resumedCount: 1,
      skippedCount: 0,
      failedCount: 1,
    });
    expect(errorCalls[0]).toEqual({
      payload: {
        companyId: "company-1",
        conversationId: "conversation-1",
        error: "resume failed",
      },
      message: "conversation auto-resume failed",
    });
    const acquisitionNows = calls.mutations
      .map((call) => call.args)
      .filter((args): args is { now: number } =>
        typeof args === "object" && args !== null && "now" in args && typeof (args as { now?: unknown }).now === "number")
      .map((args) => args.now);
    expect(acquisitionNows).toEqual([2_001, 2_002]);
    const resumedAts = calls.mutations
      .map((call) => call.args)
      .filter((args): args is { resumedAt: number } =>
        typeof args === "object" && args !== null && "resumedAt" in args && typeof (args as { resumedAt?: unknown }).resumedAt === "number")
      .map((args) => args.resumedAt);
    expect(resumedAts).toEqual([2_001, 2_002]);
  });
});
