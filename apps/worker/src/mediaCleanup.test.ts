import { describe, expect, test } from 'bun:test';
import { ConfigError } from '@cs/shared';
import { StorageError } from '@cs/storage';
import { createMediaCleanupProcessor } from './mediaCleanup';

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

const createLoggerStub = () => ({
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

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
      logger: createLoggerStub(),
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
    expect(calls.queries).toHaveLength(2);
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
      logger: createLoggerStub(),
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
      logger: createLoggerStub(),
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
});
