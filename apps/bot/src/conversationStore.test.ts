import { describe, expect, test } from 'bun:test';
import { createConvexConversationStore } from './conversationStore';

type StubConvexAdminClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createClientStub = () => {
  const queryCalls: unknown[] = [];
  const mutationCalls: unknown[] = [];
  const actionCalls: unknown[] = [];

  const client: StubConvexAdminClient = {
    action: async (_reference, args) => {
      actionCalls.push(args);
      return {
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      };
    },
    mutation: async (_reference, args) => {
      mutationCalls.push(args);
      if (typeof args === "object" && args !== null && "eventType" in (args as Record<string, unknown>)) {
        return undefined;
      }

      if (typeof args === "object" && args !== null && "source" in (args as Record<string, unknown>)) {
        return {
          id: "conversation-1",
          companyId: "company-1",
          phoneNumber: "967700000001",
          muted: (args as { source?: string }).source !== "worker_auto",
          ...(typeof (args as { resumedAt?: number }).resumedAt === "number" ? {} : { mutedAt: 1_000 }),
        };
      }

      return {
        id: "message-1",
        conversationId: "conversation-1",
        role: "user",
        content: "hello",
        timestamp: 1_000,
      };
    },
    query: async (_reference, args) => {
      queryCalls.push(args);
      if (typeof args === "object" && args !== null && "conversationId" in (args as Record<string, unknown>) && "limit" in (args as Record<string, unknown>)) {
        return [];
      }

      if (typeof args === "object" && args !== null && "conversationId" in (args as Record<string, unknown>)) {
        return {
          id: "conversation-1",
          companyId: "company-1",
          phoneNumber: "967700000001",
          muted: false,
        };
      }

      return [];
    },
  };

  return {
    actionCalls,
    client,
    mutationCalls,
    queryCalls,
  };
};

describe("createConvexConversationStore", () => {
  test("rejects blank company ids before issuing client operations", async () => {
    const { client, actionCalls, mutationCalls } = createClientStub();
    const store = createConvexConversationStore({
      createClient: () => client as never,
    });

    await expect(store.getOrCreateActiveConversation("   ", "967700000001")).rejects.toThrow(
      'Invalid companies id "   "',
    );
    await expect(store.appendUserMessage({
      companyId: "   ",
      conversationId: "conversation-1",
      content: "hello",
      timestamp: 1_000,
    })).rejects.toThrow('Invalid companies id "   "');

    expect(actionCalls).toEqual([]);
    expect(mutationCalls).toEqual([]);
  });

  test("rejects blank conversation ids before issuing client mutations", async () => {
    const { client, mutationCalls } = createClientStub();
    const store = createConvexConversationStore({
      createClient: () => client as never,
    });

    await expect(store.appendAssistantMessage({
      companyId: "company-1",
      conversationId: "   ",
      content: "hello",
      timestamp: 1_000,
    })).rejects.toThrow('Invalid conversations id "   "');

    expect(mutationCalls).toEqual([]);
  });

  test("rejects obviously invalid ids before issuing client operations", async () => {
    const { client, actionCalls, mutationCalls, queryCalls } = createClientStub();
    const store = createConvexConversationStore({
      createClient: () => client as never,
    });

    await expect(store.getOrCreateActiveConversation("company 1", "967700000001")).rejects.toThrow(
      'Invalid companies id "company 1"',
    );
    await expect(store.getPromptHistory({
      companyId: "company-1",
      conversationId: "conversation!",
      limit: 20,
    })).rejects.toThrow('Invalid conversations id "conversation!"');

    expect(actionCalls).toEqual([]);
    expect(mutationCalls).toEqual([]);
    expect(queryCalls).toEqual([]);
  });

  test("accepts valid synthetic ids used in repo tests", async () => {
    const { client, actionCalls, mutationCalls, queryCalls } = createClientStub();
    const store = createConvexConversationStore({
      createClient: () => client as never,
    });

    await store.getOrCreateActiveConversation("company-1", "967700000001");
    await store.appendUserMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      content: "hello",
      timestamp: 1_000,
    });
    await store.getPromptHistory({
      companyId: "company-1",
      conversationId: "conversation-1",
      limit: 20,
    });
    await store.getOrCreateConversationForInbound("company-1", "967700000001");
    await store.startHandoff({
      companyId: "company-1",
      conversationId: "conversation-1",
      triggerTimestamp: 2_000,
      source: "assistant_action",
    });
    await store.recordMutedCustomerActivity({
      companyId: "company-1",
      conversationId: "conversation-1",
      timestamp: 3_000,
    });
    await store.getConversation({
      companyId: "company-1",
      conversationId: "conversation-1",
    });
    await store.listRecentMessages({
      companyId: "company-1",
      conversationId: "conversation-1",
      limit: 6,
    });
    await store.recordAnalyticsEvent({
      companyId: "company-1",
      eventType: "handoff_started",
      timestamp: 4_000,
      payload: {
        source: "assistant_action",
      },
    });

    expect(actionCalls).toHaveLength(2);
    expect(mutationCalls).toHaveLength(4);
    expect(queryCalls).toHaveLength(3);
  });

  test("creates the client once and reuses it across store operations", async () => {
    const { client } = createClientStub();
    const createdClients: StubConvexAdminClient[] = [];
    const store = createConvexConversationStore({
      createClient: () => {
        createdClients.push(client);
        return client as never;
      },
    });

    await store.getOrCreateActiveConversation("company-1", "967700000001");
    await store.appendUserMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      content: "hello",
      timestamp: 1_000,
    });
    await store.trimConversationMessages({
      companyId: "company-1",
      conversationId: "conversation-1",
      maxMessages: 20,
    });

    expect(createdClients).toHaveLength(1);
    expect(createdClients[0]).toBe(client);
  });
});
