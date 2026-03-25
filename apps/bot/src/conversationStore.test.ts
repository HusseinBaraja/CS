import { describe, expect, test } from 'bun:test';
import { createConvexConversationStore } from './conversationStore';

type StubConvexAdminClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

type StubArgs = Record<string, unknown>;

const asStubArgs = (value: unknown): StubArgs | null =>
  typeof value === "object" && value !== null ? value as StubArgs : null;

const isAnalyticsMutation = (args: StubArgs): boolean => "eventType" in args;

const isConversationMutation = (args: StubArgs): boolean =>
  "source" in args
  || "pendingMessageId" in args
  || ("content" in args && "timestamp" in args && !("role" in args));

const isListQuery = (args: StubArgs): boolean => "conversationId" in args && "limit" in args;

const isConversationQuery = (args: StubArgs): boolean => "conversationId" in args;

const isInboundAppendAction = (args: StubArgs): boolean =>
  "phoneNumber" in args && "content" in args && "timestamp" in args;

const createConversationStub = (args: StubArgs) => ({
  id: "conversation-1",
  companyId: "company-1",
  phoneNumber: "967700000001",
  muted: args.source !== "worker_auto",
  ...(typeof args.resumedAt === "number" ? {} : { mutedAt: 1_000 }),
});

const createMessageStub = () => ({
  id: "message-1",
  conversationId: "conversation-1",
  role: "user" as const,
  content: "hello",
  timestamp: 1_000,
  deliveryState: "sent" as const,
});

const createActionConversationStub = () => ({
  id: "conversation-1",
  companyId: "company-1",
  phoneNumber: "967700000001",
  muted: false,
});

const createClientStub = () => {
  const queryCalls: unknown[] = [];
  const mutationCalls: unknown[] = [];
  const actionCalls: unknown[] = [];

  const client: StubConvexAdminClient = {
    action: async (_reference, args) => {
      actionCalls.push(args);
      const stubArgs = asStubArgs(args);
      if (!stubArgs) {
        return createActionConversationStub();
      }

      if (isInboundAppendAction(stubArgs)) {
        return {
          conversation: createActionConversationStub(),
          wasMuted: false,
          wasDuplicate: false,
        };
      }

      return createActionConversationStub();
    },
    mutation: async (_reference, args) => {
      mutationCalls.push(args);
      const stubArgs = asStubArgs(args);
      if (!stubArgs) {
        return createMessageStub();
      }

      if (isAnalyticsMutation(stubArgs)) {
        return undefined;
      }

      if (isConversationMutation(stubArgs)) {
        return createConversationStub(stubArgs);
      }

      return createMessageStub();
    },
    query: async (_reference, args) => {
      queryCalls.push(args);
      const stubArgs = asStubArgs(args);
      if (!stubArgs) {
        return [];
      }

      if (isListQuery(stubArgs)) {
        return [];
      }

      if (isConversationQuery(stubArgs)) {
        return createActionConversationStub();
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
    await store.appendInboundCustomerMessage({
      companyId: "company-1",
      phoneNumber: "967700000001",
      content: "hello from inbound",
      timestamp: 900,
      transportMessageId: "inbound-1",
      referencedTransportMessageId: "quoted-1",
    });
    await store.appendUserMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      content: "hello",
      timestamp: 1_000,
      transportMessageId: "user-1",
    });
    await store.appendMutedCustomerMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      content: "hello again",
      timestamp: 1_500,
      transportMessageId: "muted-1",
      referencedTransportMessageId: "quoted-2",
    });
    await store.appendAssistantMessageAndStartHandoff({
      companyId: "company-1",
      conversationId: "conversation-1",
      content: "Connecting you with the team.",
      timestamp: 1_750,
      source: "assistant_action",
      transportMessageId: "assistant-1",
    });
    await store.appendPendingAssistantMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      content: "Assistant reply",
      timestamp: 1_800,
      source: "assistant_action",
    });
    await store.acknowledgePendingAssistantMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      acknowledgedAt: 1_850,
      transportMessageId: "assistant-ack-1",
    });
    await store.completePendingAssistantSideEffects({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      analyticsCompleted: true,
    });
    await store.recordPendingAssistantSideEffectProgress({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      ownerNotificationSent: true,
    });
    await store.commitPendingAssistantMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      transportMessageId: "assistant-2",
    });
    await store.markPendingAssistantMessageFailed({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
    });
    await store.getPromptHistory({
      companyId: "company-1",
      conversationId: "conversation-1",
      limit: 20,
    });
    await store.getPromptHistoryForInbound({
      companyId: "company-1",
      conversationId: "conversation-1",
      inboundTimestamp: 2_500,
      currentTransportMessageId: "inbound-2",
      referencedTransportMessageId: "quoted-3",
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
      idempotencyKey: "pendingMessage:message-1:handoff_started",
      timestamp: 4_000,
      payload: {
        source: "assistant_action",
      },
    });

    expect(actionCalls).toHaveLength(3);
    expect(mutationCalls).toHaveLength(12);
    expect(queryCalls).toHaveLength(4);
  });

  test("forwards pending assistant lifecycle mutations to Convex", async () => {
    const { client, mutationCalls } = createClientStub();
    const store = createConvexConversationStore({
      createClient: () => client as never,
    });

    await store.appendPendingAssistantMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      content: "Assistant reply",
      timestamp: 1_000,
      source: "assistant_action",
      reason: "requested handoff",
    });
    await store.acknowledgePendingAssistantMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      acknowledgedAt: 1_050,
      transportMessageId: "transport-ack-1",
    });
    await store.completePendingAssistantSideEffects({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      analyticsCompleted: true,
      ownerNotificationCompleted: true,
    });
    await store.recordPendingAssistantSideEffectProgress({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      analyticsRecorded: true,
      ownerNotificationSent: true,
    });
    await store.commitPendingAssistantMessage({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
      transportMessageId: "transport-1",
    });
    await store.markPendingAssistantMessageFailed({
      companyId: "company-1",
      conversationId: "conversation-1",
      pendingMessageId: "message-1",
    });

    expect(mutationCalls.slice(-6)).toEqual([
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        content: "Assistant reply",
        timestamp: 1_000,
        source: "assistant_action",
        reason: "requested handoff",
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        pendingMessageId: "message-1",
        acknowledgedAt: 1_050,
        transportMessageId: "transport-ack-1",
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        pendingMessageId: "message-1",
        analyticsCompleted: true,
        ownerNotificationCompleted: true,
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        pendingMessageId: "message-1",
        analyticsRecorded: true,
        ownerNotificationSent: true,
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        pendingMessageId: "message-1",
        transportMessageId: "transport-1",
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        pendingMessageId: "message-1",
      },
    ]);
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
