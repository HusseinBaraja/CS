import { describe, expect, test } from "bun:test";
import {
  runPendingHandoffSideEffects,
  type PendingHandoffSideEffectFailure,
} from "./pendingHandoffSideEffects";

const baseInput = {
  companyId: "company-1",
  conversationId: "conversation-1",
  customerPhoneNumber: "967700000001",
  handoffSource: "assistant_action" as const,
  pendingMessageId: "pending-1",
  timestamp: 1_000,
};

describe("runPendingHandoffSideEffects", () => {
  test("records and completes pending handoff analytics and owner notification", async () => {
    const operations: string[] = [];

    const result = await runPendingHandoffSideEffects({
      ...baseInput,
      analyticsState: "pending",
      ownerNotificationState: "pending",
      completeAnalytics: async () => {
        operations.push("complete:analytics");
      },
      completeOwnerNotification: async () => {
        operations.push("complete:owner");
      },
      getOwnerNotificationContext: async () => ({
        companyName: "Tenant A",
        ownerPhone: "966500000000",
      }),
      listRecentMessages: async () => [{
        id: "message-1",
        companyId: "company-1",
        conversationId: "conversation-1",
        role: "user",
        content: "hello",
        timestamp: 900,
      }],
      recordAnalytics: async (input) => {
        operations.push(`analytics:${input.idempotencyKey}`);
      },
      recordAnalyticsProgress: async () => {
        operations.push("progress:analytics");
      },
      recordOwnerNotificationProgress: async () => {
        operations.push("progress:owner");
      },
      sendOwnerNotification: async (input) => {
        operations.push(`send:${input.recipientJid}:${input.text.includes("Tenant A")}`);
      },
    });

    expect(result.failures).toEqual([]);
    expect(operations).toEqual([
      "analytics:pendingMessage:pending-1:handoff_started",
      "progress:analytics",
      "complete:analytics",
      "send:966500000000@s.whatsapp.net:true",
      "progress:owner",
      "complete:owner",
    ]);
  });

  test("completes recorded and sent side effects without repeating external effects", async () => {
    const operations: string[] = [];

    const result = await runPendingHandoffSideEffects({
      ...baseInput,
      analyticsState: "recorded",
      ownerNotificationState: "sent",
      completeAnalytics: async () => {
        operations.push("complete:analytics");
      },
      completeOwnerNotification: async () => {
        operations.push("complete:owner");
      },
      getOwnerNotificationContext: async () => {
        throw new Error("should not load owner context");
      },
      listRecentMessages: async () => {
        throw new Error("should not load history");
      },
      recordAnalytics: async () => {
        throw new Error("should not record analytics");
      },
      recordAnalyticsProgress: async () => {
        throw new Error("should not record analytics progress");
      },
      recordOwnerNotificationProgress: async () => {
        throw new Error("should not record owner progress");
      },
      sendOwnerNotification: async () => {
        throw new Error("should not send notification");
      },
    });

    expect(result.failures).toEqual([]);
    expect(operations).toEqual(["complete:analytics", "complete:owner"]);
  });

  test("isolates analytics failure and still sends owner notification", async () => {
    const operations: string[] = [];

    const result = await runPendingHandoffSideEffects({
      ...baseInput,
      analyticsState: "pending",
      ownerNotificationState: "pending",
      completeAnalytics: async () => {
        operations.push("complete:analytics");
      },
      completeOwnerNotification: async () => {
        operations.push("complete:owner");
      },
      getOwnerNotificationContext: async () => ({
        companyName: "Tenant A",
        ownerPhone: "966500000000",
      }),
      listRecentMessages: async () => [],
      recordAnalytics: async () => {
        operations.push("analytics");
        throw new Error("analytics failed");
      },
      recordAnalyticsProgress: async () => {
        operations.push("progress:analytics");
      },
      recordOwnerNotificationProgress: async () => {
        operations.push("progress:owner");
      },
      sendOwnerNotification: async () => {
        operations.push("send");
      },
    });

    expect(operations).toEqual(["analytics", "send", "progress:owner", "complete:owner"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.sideEffect).toBe("analytics");
    expect((result.failures[0] as PendingHandoffSideEffectFailure).error).toBeInstanceOf(Error);
  });

  test("reports owner notification failure when owner phone is invalid", async () => {
    const result = await runPendingHandoffSideEffects({
      ...baseInput,
      analyticsState: "not_applicable",
      ownerNotificationState: "pending",
      completeAnalytics: async () => {
        throw new Error("should not complete analytics");
      },
      completeOwnerNotification: async () => {
        throw new Error("should not complete owner");
      },
      getOwnerNotificationContext: async () => ({
        companyName: "Tenant A",
        ownerPhone: "not-a-phone",
      }),
      listRecentMessages: async () => [],
      recordAnalytics: async () => {
        throw new Error("should not record analytics");
      },
      recordAnalyticsProgress: async () => {
        throw new Error("should not record analytics progress");
      },
      recordOwnerNotificationProgress: async () => {
        throw new Error("should not record owner progress");
      },
      sendOwnerNotification: async () => {
        throw new Error("should not send notification");
      },
    });

    expect(result.failures).toHaveLength(1);
    const [failure] = result.failures;
    if (!failure) {
      throw new Error("Expected owner notification failure");
    }
    expect(failure.sideEffect).toBe("owner_notification");
    expect((failure.error as Error).message).toBe("Owner notification context unavailable");
  });
});
