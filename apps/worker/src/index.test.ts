import { describe, expect, test } from 'bun:test';
import { startWorker } from './index';

type RegisteredHandler = () => void | Promise<void>;

const createLoggerStub = () => {
  const infoCalls: Array<{ payload: unknown; message: string }> = [];
  const errorCalls: Array<{ payload: unknown; message: string }> = [];

  return {
    logger: {
      info: (payload: unknown, message: string) => {
        infoCalls.push({ payload, message });
      },
      error: (payload: unknown, message: string) => {
        errorCalls.push({ payload, message });
      },
    },
    infoCalls,
    errorCalls,
  };
};

const createProcessStub = () => {
  const handlers = new Map<string, RegisteredHandler>();

  return {
    process: {
      exitCode: undefined as number | undefined,
      once: (event: string, handler: RegisteredHandler) => {
        handlers.set(event, handler);
        return undefined as never;
      },
    },
    handlers,
  };
};

describe("startWorker", () => {
  test("runs an initial tick and registers graceful shutdown handlers", async () => {
    const events: string[] = [];
    const { logger, infoCalls, errorCalls } = createLoggerStub();
    const { process, handlers } = createProcessStub();
    let stopCallCount = 0;

    await startWorker({
      logger,
      workerProcess: process,
      createMediaCleanupProcessor: () => ({
        runTick: async () => {
          events.push("runTick");
          return {
            expiredUploadCount: 0,
            completedJobs: 0,
            retriedJobs: 0,
            failedJobs: 0,
            skippedJobs: 0,
          };
        },
        start: () => {
          events.push("start");
          return () => {
            stopCallCount += 1;
            events.push("stop");
          };
        },
      }),
    });

    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0]?.message).toBe("worker initialized");
    expect(infoCalls[0]?.payload).toEqual({
      db: {
        provider: expect.any(String),
      },
    });
    expect(errorCalls).toEqual([]);
    expect(events).toEqual(["runTick", "start"]);
    expect(Array.from(handlers.keys()).sort()).toEqual(["SIGINT", "SIGTERM", "beforeExit"]);

    await handlers.get("SIGINT")?.();
    expect(stopCallCount).toBe(1);
    expect(events).toEqual(["runTick", "start", "stop"]);
  });

  test("calls the stop function only once across multiple shutdown signals", async () => {
    const { logger } = createLoggerStub();
    const { process, handlers } = createProcessStub();
    let stopCallCount = 0;

    await startWorker({
      logger,
      workerProcess: process,
      createMediaCleanupProcessor: () => ({
        runTick: async () => ({
          expiredUploadCount: 0,
          completedJobs: 0,
          retriedJobs: 0,
          failedJobs: 0,
          skippedJobs: 0,
        }),
        start: () => async () => {
          stopCallCount += 1;
        },
      }),
    });

    await handlers.get("SIGINT")?.();
    await handlers.get("SIGTERM")?.();
    await handlers.get("beforeExit")?.();

    expect(stopCallCount).toBe(1);
  });

  test("logs shutdown errors and marks the process exit code", async () => {
    const { logger, errorCalls } = createLoggerStub();
    const { process, handlers } = createProcessStub();

    await startWorker({
      logger,
      workerProcess: process,
      createMediaCleanupProcessor: () => ({
        runTick: async () => ({
          expiredUploadCount: 0,
          completedJobs: 0,
          retriedJobs: 0,
          failedJobs: 0,
          skippedJobs: 0,
        }),
        start: () => async () => {
          throw new Error("stop failed");
        },
      }),
    });

    await handlers.get("SIGTERM")?.();

    expect(process.exitCode).toBe(1);
    expect(errorCalls).toEqual([
      {
        payload: {
          error: expect.any(Error),
          signal: "SIGTERM",
        },
        message: "worker shutdown failed",
      },
    ]);
  });

  test("propagates startup failures from the initial tick", async () => {
    const { logger } = createLoggerStub();
    const { process } = createProcessStub();

    await expect(startWorker({
      logger,
      workerProcess: process,
      createMediaCleanupProcessor: () => ({
        runTick: async () => {
          throw new Error("tick failed");
        },
        start: () => () => undefined,
      }),
    })).rejects.toThrow("tick failed");
  });
});
