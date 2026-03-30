import { describe, expect, test } from 'bun:test';
import { startWorker } from './index';

type RegisteredHandler = () => void | Promise<void>;

const createLoggerStub = () => {
  const infoCalls: Array<{ payload: unknown; message: string }> = [];
  const errorCalls: Array<{ payload: unknown; message: string }> = [];

  const createLogger = (bindings: Record<string, unknown> = {}) => ({
    debug: (payload: unknown, message: string) => {
      infoCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message,
      });
    },
    info: (payload: unknown, message: string) => {
      infoCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message,
      });
    },
    warn: () => undefined,
    error: (payload: unknown, message: string) => {
      errorCalls.push({
        payload: typeof payload === "object" && payload !== null
          ? { ...bindings, ...payload }
          : payload,
        message,
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
  test("runs initial ticks, logs startup completion, and registers graceful shutdown handlers", async () => {
    const events: string[] = [];
    const { logger, infoCalls, errorCalls } = createLoggerStub();
    const { process, handlers } = createProcessStub();
    let stopCallCount = 0;

    await startWorker({
      logger,
      workerProcess: process,
      createConversationAutoResumeProcessor: () => ({
        runTick: async () => {
          events.push("runTick:autoResume");
          return {
            resumedCount: 0,
            skippedCount: 0,
            failedCount: 0,
          };
        },
        start: () => {
          events.push("start:autoResume");
          return () => {
            stopCallCount += 1;
            events.push("stop:autoResume");
          };
        },
      }),
      createPendingAssistantReconciliationProcessor: () => ({
        runTick: async () => {
          events.push("runTick:pendingAssistant");
          return {
            reconciledCount: 0,
            skippedCount: 0,
            failedCount: 0,
          };
        },
        start: () => {
          events.push("start:pendingAssistant");
          return () => {
            stopCallCount += 1;
            events.push("stop:pendingAssistant");
          };
        },
      }),
      createMediaCleanupProcessor: () => ({
        runTick: async () => {
          events.push("runTick:mediaCleanup");
          return {
            expiredUploadCount: 0,
            completedJobs: 0,
            retriedJobs: 0,
            failedJobs: 0,
            skippedJobs: 0,
          };
        },
        start: () => {
          events.push("start:mediaCleanup");
          return () => {
            stopCallCount += 1;
            events.push("stop:mediaCleanup");
          };
        },
      }),
    });

    expect(infoCalls).toEqual([
      {
        payload: {
          event: "worker.startup.completed",
          runtime: "worker",
          surface: "lifecycle",
          outcome: "success",
          dbProvider: "convex",
        },
        message: "worker startup completed",
      },
    ]);
    expect(errorCalls).toEqual([]);
    expect(events).toEqual([
      "runTick:autoResume",
      "runTick:pendingAssistant",
      "runTick:mediaCleanup",
      "start:autoResume",
      "start:pendingAssistant",
      "start:mediaCleanup",
    ]);
    expect(Array.from(handlers.keys()).sort()).toEqual(["SIGINT", "SIGTERM", "beforeExit"]);

    await handlers.get("SIGINT")?.();
    expect(stopCallCount).toBe(3);
    expect(events).toEqual([
      "runTick:autoResume",
      "runTick:pendingAssistant",
      "runTick:mediaCleanup",
      "start:autoResume",
      "start:pendingAssistant",
      "start:mediaCleanup",
      "stop:autoResume",
      "stop:pendingAssistant",
      "stop:mediaCleanup",
    ]);
  });

  test("calls the stop function only once across multiple shutdown signals", async () => {
    const { logger } = createLoggerStub();
    const { process, handlers } = createProcessStub();
    let stopCallCount = 0;

    await startWorker({
      logger,
      workerProcess: process,
      createConversationAutoResumeProcessor: () => ({
        runTick: async () => ({
          resumedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        }),
        start: () => async () => {
          stopCallCount += 1;
        },
      }),
      createPendingAssistantReconciliationProcessor: () => ({
        runTick: async () => ({
          reconciledCount: 0,
          skippedCount: 0,
          failedCount: 0,
        }),
        start: () => async () => {
          stopCallCount += 1;
        },
      }),
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

    expect(stopCallCount).toBe(3);
  });

  test("logs each shutdown error and marks the process exit code", async () => {
    const { logger, errorCalls } = createLoggerStub();
    const { process, handlers } = createProcessStub();

    await startWorker({
      logger,
      workerProcess: process,
      createConversationAutoResumeProcessor: () => ({
        runTick: async () => ({
          resumedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        }),
        start: () => async () => {
          throw new Error("stop failed");
        },
      }),
      createPendingAssistantReconciliationProcessor: () => ({
        runTick: async () => ({
          reconciledCount: 0,
          skippedCount: 0,
          failedCount: 0,
        }),
        start: () => async () => {
          throw new Error("stop failed");
        },
      }),
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
          event: "worker.shutdown.failed",
          runtime: "worker",
          surface: "lifecycle",
          outcome: "failed",
          error: expect.objectContaining({
            message: "stop failed",
            name: "Error",
          }),
          signal: "SIGTERM",
          stopTarget: "conversationAutoResume",
        },
        message: "worker shutdown failed",
      },
      {
        payload: {
          event: "worker.shutdown.failed",
          runtime: "worker",
          surface: "lifecycle",
          outcome: "failed",
          error: expect.objectContaining({
            message: "stop failed",
            name: "Error",
          }),
          signal: "SIGTERM",
          stopTarget: "pendingAssistantReconciliation",
        },
        message: "worker shutdown failed",
      },
      {
        payload: {
          event: "worker.shutdown.failed",
          runtime: "worker",
          surface: "lifecycle",
          outcome: "failed",
          error: expect.objectContaining({
            message: "stop failed",
            name: "Error",
          }),
          signal: "SIGTERM",
          stopTarget: "mediaCleanup",
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
      createConversationAutoResumeProcessor: () => ({
        runTick: async () => {
          throw new Error("tick failed");
        },
        start: () => () => undefined,
      }),
      createPendingAssistantReconciliationProcessor: () => ({
        runTick: async () => {
          throw new Error("should not be called");
        },
        start: () => () => undefined,
      }),
      createMediaCleanupProcessor: () => ({
        runTick: async () => {
          throw new Error("should not be called");
        },
        start: () => () => undefined,
      }),
    })).rejects.toThrow("tick failed");
  });
});
