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

  const createLogger = (bindings: Record<string, unknown> = {}) => ({
    debug: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      infoCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message: typeof message === "string" ? message : String(message),
      });
    },
    info: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      infoCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message: typeof message === "string" ? message : String(message),
      });
    },
    warn: () => undefined,
    error: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      errorCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message: typeof message === "string" ? message : String(message),
      });
    },
    child: (childBindings: Record<string, unknown>) => createLogger({ ...bindings, ...childBindings }),
  });

  return {
    logger: createLogger(),
    infoCalls,
    errorCalls,
  };
};

const flushMicrotasks = async (turns = 20) => {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
};

describe("createConversationAutoResumeProcessor", () => {
  test("logs scheduled tick failures with elapsed duration", async () => {
    const { client } = createClientStub({
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      query: async () => {
        throw new Error("tick exploded");
      },
    });
    const { logger, errorCalls } = createLoggerStub();
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduledCallbacks: Array<() => void> = [];
    const clearedTimeouts: number[] = [];
    let nextTimeoutId = 0;

    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback !== "function") {
        throw new Error("Expected timer callback");
      }

      scheduledCallbacks.push(callback as () => void);
      nextTimeoutId += 1;
      return nextTimeoutId as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((timeoutId: ReturnType<typeof setTimeout>) => {
      clearedTimeouts.push(timeoutId as unknown as number);
    }) as typeof clearTimeout;

    try {
      const processor = createConversationAutoResumeProcessor({
        createClient: () => client as never,
        logger,
      });

      const stop = processor.start();
      expect(scheduledCallbacks).toHaveLength(1);

      scheduledCallbacks.shift()?.();
      await flushMicrotasks();

      expect(errorCalls).toEqual([
        {
          payload: {
            event: "worker.job.tick_failed",
            runtime: "worker",
            surface: "job",
            outcome: "failed",
            jobName: "conversationAutoResume",
            durationMs: expect.any(Number),
            error: expect.objectContaining({
              message: "tick exploded",
              name: "Error",
            }),
          },
          message: "conversation auto-resume tick failed",
        },
      ]);
      expect(scheduledCallbacks).toHaveLength(1);

      stop();
      expect(clearedTimeouts).toEqual([2]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

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
        event: "worker.job.tick_completed",
        runtime: "worker",
        surface: "job",
        jobName: "conversationAutoResume",
        outcome: "success",
        processedCount: 1,
        succeededCount: 1,
        failedCount: 0,
        retryCount: 0,
        resumedCount: 1,
        skippedCount: 0,
        durationMs: expect.any(Number),
      },
      message: "conversation auto-resume tick completed",
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
        event: "worker.job.item_failed",
        runtime: "worker",
        surface: "job",
        jobName: "conversationAutoResume",
        outcome: "failed",
        companyId: "company-1",
        conversationId: "conversation-1",
        error: expect.objectContaining({
          message: "resume failed",
          name: "Error",
        }),
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

  test("logs lock release failures without overriding a successful resume", async () => {
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
          nextAutoResumeAt: 1_000,
        };
      },
      mutation: async (_reference, args) => {
        const record = args as Record<string, unknown>;
        if ("ownerToken" in record && "now" in record) {
          return {
            acquired: true,
            waitMs: 0,
          };
        }

        if ("key" in record && "ownerToken" in record && !("now" in record)) {
          throw new Error("release failed");
        }

        return undefined;
      },
    });
    const { logger, errorCalls } = createLoggerStub();
    const processor = createConversationAutoResumeProcessor({
      createClient: () => client as never,
      logger,
      now: () => 2_000,
    });

    await expect(processor.runTick()).resolves.toEqual({
      resumedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(errorCalls).toEqual([{
      payload: {
        event: "worker.job.item_failed",
        runtime: "worker",
        surface: "job",
        jobName: "conversationAutoResume",
        outcome: "failed",
        companyId: "company-1",
        conversationId: "conversation-1",
        error: expect.objectContaining({
          message: "release failed",
          name: "Error",
        }),
        step: "lock_release",
      },
      message: "conversation auto-resume lock release failed",
    }]);
  });
});
