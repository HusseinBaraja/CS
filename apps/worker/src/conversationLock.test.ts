import { describe, expect, test } from 'bun:test';
import {
  getConversationAutoResumeLockKey,
  getConversationLockKey,
  withConversationLock,
} from './conversationLock';

type StubCall = {
  reference: unknown;
  args: unknown;
};

const createClientStub = (mutation: (reference: unknown, args: unknown) => Promise<unknown>) => {
  const calls: StubCall[] = [];

  return {
    client: {
      mutation: async (reference: unknown, args: unknown) => {
        calls.push({ reference, args });
        return mutation(reference, args);
      },
    },
    calls,
  };
};

const createLoggerStub = () => {
  const errorCalls: Array<{ payload: unknown; message: string }> = [];
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (...args: unknown[]) => {
      const [payload = {}, message = ""] = args;
      errorCalls.push({
        payload,
        message: typeof message === "string" ? message : String(message),
      });
    },
    child: () => logger,
  };

  return { logger, errorCalls };
};

describe("conversation lock", () => {
  test("builds stable conversation recovery lock keys", () => {
    expect(getConversationLockKey("company-1", "967700000001"))
      .toBe("conversation:company-1:967700000001");
    expect(getConversationAutoResumeLockKey("conversation-1"))
      .toBe("conversation:auto-resume:conversation-1");
  });

  test("skips callback when lock acquisition is denied", async () => {
    const { client, calls } = createClientStub(async () => ({ acquired: false, waitMs: 100 }));
    const { logger, errorCalls } = createLoggerStub();
    let runCount = 0;

    await expect(withConversationLock({
      client: client as never,
      context: {
        jobName: "job",
        companyId: "company-1",
        conversationId: "conversation-1",
      },
      key: "conversation:company-1:967700000001",
      logger,
      now: 1_000,
      releaseFailureMessage: "release failed",
      run: async () => {
        runCount += 1;
        return "done";
      },
    })).resolves.toBe("skipped");

    expect(runCount).toBe(0);
    expect(calls).toHaveLength(1);
    expect(errorCalls).toEqual([]);
  });

  test("logs lock release failures without overriding callback result", async () => {
    const { client } = createClientStub(async (_reference, args) => {
      if ("now" in (args as Record<string, unknown>)) {
        return { acquired: true, waitMs: 0 };
      }

      throw new Error("release failed");
    });
    const { logger, errorCalls } = createLoggerStub();

    await expect(withConversationLock({
      client: client as never,
      context: {
        jobName: "job",
        companyId: "company-1",
        conversationId: "conversation-1",
        messageId: "message-1",
      },
      key: "conversation:company-1:967700000001",
      logger,
      now: 1_000,
      releaseFailureMessage: "lock release failed",
      run: async () => "done",
    })).resolves.toBe("done");

    expect(errorCalls).toEqual([{
      payload: {
        event: "worker.job.item_failed",
        runtime: "worker",
        surface: "job",
        jobName: "job",
        outcome: "failed",
        companyId: "company-1",
        conversationId: "conversation-1",
        messageId: "message-1",
        step: "lock_release",
        error: expect.objectContaining({
          message: "release failed",
          name: "Error",
        }),
      },
      message: "lock release failed",
    }]);
  });
});
