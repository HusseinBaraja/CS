import { describe, expect, test } from 'bun:test';
import { ConfigError } from '@cs/shared';
import { StorageError } from '@cs/storage';
import { createMediaCleanupProcessor } from './mediaCleanup';

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
  const warnCalls: LoggerCall[] = [];
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
      warn: (...args: unknown[]) => {
        captureCall(warnCalls, args);
      },
      error: (...args: unknown[]) => {
        captureCall(errorCalls, args);
      },
    },
    infoCalls,
    warnCalls,
    errorCalls,
  };
};

const flushMicrotasks = async (turns = 20) => {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
};

describe("createMediaCleanupProcessor", () => {
  test("expires pending uploads and completes due cleanup jobs", async () => {
    const { client, calls } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as { jobId?: string };
        if ("limit" in (args as Record<string, unknown>)) {
          return ["upload-1"];
        }
        if (input.jobId === "job-1") {
          return {
            _id: "job-1",
            objectKey: "companies/company-1/products/product-1/image-1.jpg",
            attempts: 0,
          };
        }
        return null;
      },
      query: async (_reference, args) => {
        const input = args as { status: string };
        if (input.status === "pending") {
          return ["job-1"];
        }
        return [];
      },
    });

    let deletedKey: string | null = null;
    const processor = createMediaCleanupProcessor({
      createClient: () => client as never,
      createStorage: () =>
        ({
          createPresignedUpload: async () => {
            throw new Error("not used");
          },
          createPresignedDownload: async () => {
            throw new Error("not used");
          },
          statObject: async () => {
            throw new Error("not used");
          },
          deleteObject: async (key: string) => {
            deletedKey = key;
          },
        }) as never,
      logger: createLoggerStub().logger,
      now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
    });

    await expect(processor.runTick()).resolves.toEqual({
      expiredUploadCount: 1,
      completedJobs: 1,
      retriedJobs: 0,
      failedJobs: 0,
      skippedJobs: 0,
    });
    expect(deletedKey as string | null).toBe("companies/company-1/products/product-1/image-1.jpg");
    expect(calls.mutations).toHaveLength(3);
    expect(calls.queries).toHaveLength(3);
  });

  test("retries transient storage failures", async () => {
    const mutationArgs: unknown[] = [];
    const { client } = createClientStub({
      mutation: async (_reference, args) => {
        mutationArgs.push(args);
        const input = args as { jobId?: string };
        if ("limit" in (args as Record<string, unknown>)) {
          return [];
        }
        if (input.jobId === "job-1") {
          return {
            _id: "job-1",
            objectKey: "companies/company-1/products/product-1/image-1.jpg",
            attempts: 0,
          };
        }
        return null;
      },
      query: async (_reference, args) => {
        const input = args as { status: string };
        if (input.status === "pending") {
          return ["job-1"];
        }
        return [];
      },
    });

    const processor = createMediaCleanupProcessor({
      createClient: () => client as never,
      createStorage: () =>
        ({
          createPresignedUpload: async () => {
            throw new Error("not used");
          },
          createPresignedDownload: async () => {
            throw new Error("not used");
          },
          statObject: async () => {
            throw new Error("not used");
          },
          deleteObject: async () => {
            throw new StorageError("temporary outage");
          },
        }) as never,
      logger: createLoggerStub().logger,
      now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
    });

    await expect(processor.runTick()).resolves.toEqual({
      expiredUploadCount: 0,
      completedJobs: 0,
      retriedJobs: 1,
      failedJobs: 0,
      skippedJobs: 0,
    });
    expect(mutationArgs).toContainEqual({
      jobId: "job-1",
      now: Date.UTC(2026, 2, 12, 0, 0, 0),
      nextAttemptAt: Date.UTC(2026, 2, 12, 0, 0, 30),
      lastError: "temporary outage",
    });
  });

  test("marks terminal configuration failures as failed", async () => {
    const mutationArgs: unknown[] = [];
    const { client } = createClientStub({
      mutation: async (_reference, args) => {
        mutationArgs.push(args);
        const input = args as { jobId?: string };
        if ("limit" in (args as Record<string, unknown>)) {
          return [];
        }
        if (input.jobId === "job-1") {
          return {
            _id: "job-1",
            objectKey: "companies/company-1/products/product-1/image-1.jpg",
            attempts: 0,
          };
        }
        return null;
      },
      query: async (_reference, args) => {
        const input = args as { status: string };
        if (input.status === "pending") {
          return ["job-1"];
        }
        return [];
      },
    });

    const processor = createMediaCleanupProcessor({
      createClient: () => client as never,
      createStorage: () =>
        ({
          createPresignedUpload: async () => {
            throw new Error("not used");
          },
          createPresignedDownload: async () => {
            throw new Error("not used");
          },
          statObject: async () => {
            throw new Error("not used");
          },
          deleteObject: async () => {
            throw new ConfigError("Missing required environment variable: R2_ACCESS_KEY_ID");
          },
        }) as never,
      logger: createLoggerStub().logger,
      now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
    });

    await expect(processor.runTick()).resolves.toEqual({
      expiredUploadCount: 0,
      completedJobs: 0,
      retriedJobs: 0,
      failedJobs: 1,
      skippedJobs: 0,
    });
    expect(mutationArgs).toContainEqual({
      jobId: "job-1",
      now: Date.UTC(2026, 2, 12, 0, 0, 0),
      lastError: "Missing required environment variable: R2_ACCESS_KEY_ID",
    });
  });

  test("limits pending, stale processing, and retry jobs to a single combined batch size", async () => {
    const queryArgs: unknown[] = [];
    const { client } = createClientStub({
      mutation: async (_reference, args) => {
        const input = args as { jobId?: string };
        if ("limit" in (args as Record<string, unknown>)) {
          return [];
        }
        if (input.jobId) {
          return {
            _id: input.jobId,
            objectKey: `companies/company-1/products/product-1/${input.jobId}.jpg`,
            attempts: 0,
          };
        }
        return null;
      },
      query: async (_reference, args) => {
        queryArgs.push(args);
        const input = args as { status: string; limit: number };
        if (input.status === "pending") {
          return ["job-1"];
        }
        if (input.status === "processing") {
          return ["job-2"];
        }
        return ["job-3", "job-4"];
      },
    });

    const deletedKeys: string[] = [];
    const processor = createMediaCleanupProcessor({
      createClient: () => client as never,
      createStorage: () =>
        ({
          createPresignedUpload: async () => {
            throw new Error("not used");
          },
          createPresignedDownload: async () => {
            throw new Error("not used");
          },
          statObject: async () => {
            throw new Error("not used");
          },
          deleteObject: async (key: string) => {
            deletedKeys.push(key);
          },
        }) as never,
      logger: createLoggerStub().logger,
      now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
      batchSize: 3,
    });

    await expect(processor.runTick()).resolves.toEqual({
      expiredUploadCount: 0,
      completedJobs: 3,
      retriedJobs: 0,
      failedJobs: 0,
      skippedJobs: 0,
    });
    expect(queryArgs).toEqual([
      {
        status: "pending",
        now: Date.UTC(2026, 2, 12, 0, 0, 0),
        limit: 3,
      },
      {
        status: "processing",
        now: Date.UTC(2026, 2, 12, 0, 0, 0),
        limit: 2,
      },
      {
        status: "retry",
        now: Date.UTC(2026, 2, 12, 0, 0, 0),
        limit: 1,
      },
    ]);
    expect(deletedKeys).toEqual([
      "companies/company-1/products/product-1/job-1.jpg",
      "companies/company-1/products/product-1/job-2.jpg",
      "companies/company-1/products/product-1/job-3.jpg",
    ]);
  });

  test("catches scheduled tick failures and logs them without leaking rejections", async () => {
    const { client } = createClientStub({
      mutation: async () => {
        throw new Error("tick exploded");
      },
      query: async () => {
        throw new Error("query should not be called");
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
      const processor = createMediaCleanupProcessor({
        createClient: () => client as never,
        createStorage: () =>
          ({
            createPresignedUpload: async () => {
              throw new Error("not used");
            },
            createPresignedDownload: async () => {
              throw new Error("not used");
            },
            statObject: async () => {
              throw new Error("not used");
            },
            deleteObject: async () => undefined,
          }) as never,
        logger,
      });

      const stop = processor.start();
      expect(scheduledCallbacks).toHaveLength(1);

      scheduledCallbacks.shift()?.();
      await flushMicrotasks();

      expect(errorCalls).toEqual([
        {
          payload: { error: "tick exploded" },
          message: "media cleanup tick failed",
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

  test("logs reschedule failures from the scheduled callback and stops safely", async () => {
    const { client } = createClientStub({
      mutation: async (_reference, args) => {
        if ("limit" in (args as Record<string, unknown>)) {
          return [];
        }

        return null;
      },
      query: async () => [],
    });
    const { logger, errorCalls } = createLoggerStub();
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduledCallbacks: Array<() => void> = [];
    const clearedTimeouts: number[] = [];
    let timeoutCallCount = 0;

    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback !== "function") {
        throw new Error("Expected timer callback");
      }

      timeoutCallCount += 1;
      if (timeoutCallCount === 1) {
        scheduledCallbacks.push(callback as () => void);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }

      throw new Error("scheduler unavailable");
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((timeoutId: ReturnType<typeof setTimeout>) => {
      clearedTimeouts.push(timeoutId as unknown as number);
    }) as typeof clearTimeout;

    try {
      const processor = createMediaCleanupProcessor({
        createClient: () => client as never,
        createStorage: () =>
          ({
            createPresignedUpload: async () => {
              throw new Error("not used");
            },
            createPresignedDownload: async () => {
              throw new Error("not used");
            },
            statObject: async () => {
              throw new Error("not used");
            },
            deleteObject: async () => undefined,
          }) as never,
        logger,
      });

      const stop = processor.start();
      expect(scheduledCallbacks).toHaveLength(1);

      scheduledCallbacks.shift()?.();
      await flushMicrotasks();

      expect(errorCalls).toEqual([
        {
          payload: { error: "scheduler unavailable" },
          message: "media cleanup tick failed",
        },
      ]);

      expect(() => stop()).not.toThrow();
      expect(clearedTimeouts).toEqual([1]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
