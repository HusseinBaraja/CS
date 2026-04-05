import { describe, expect, test } from 'bun:test';
import type { AssistantSemanticRecordDto, ConversationSummaryDto } from '@cs/shared';
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

const isCanonicalStateMutation = (args: StubArgs): boolean =>
  "assistantActionType" in args && "retrievalOutcome" in args;

const isConversationMutation = (args: StubArgs): boolean =>
  "source" in args
  || "pendingMessageId" in args
  || ("content" in args && "timestamp" in args && !("role" in args));

const isListQuery = (args: StubArgs): boolean => "conversationId" in args && "limit" in args;

const isConversationQuery = (args: StubArgs): boolean => "conversationId" in args;

const isInboundPromptHistoryQuery = (args: StubArgs): boolean =>
  "conversationId" in args && "limit" in args && "inboundTimestamp" in args;

const isCanonicalStateQuery = (args: StubArgs): boolean =>
  "conversationId" in args && "now" in args && !("limit" in args);

const isQuotedReferenceQuery = (args: StubArgs): boolean =>
  "conversationId" in args && "referencedTransportMessageId" in args;

const isSemanticAssistantRecordsQuery = (args: StubArgs): boolean =>
  "conversationId" in args && "limit" in args && "beforeTimestamp" in args && !("inboundTimestamp" in args);

const isConversationSummaryQuery = (args: StubArgs): boolean =>
  "conversationId" in args
  && !("limit" in args)
  && !("now" in args)
  && !("referencedTransportMessageId" in args);

const isInboundAppendAction = (args: StubArgs): boolean =>
  "phoneNumber" in args && "content" in args && "timestamp" in args;

const isAssistantSemanticRecordMutation = (args: StubArgs): boolean =>
  "assistantMessageId" in args && "normalizedAction" in args && "responseMode" in args;

const isConversationSummaryMutation = (args: StubArgs): boolean =>
  "summaryId" in args && "stablePreferences" in args && "freshness" in args;

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

const createCanonicalStateStub = () => ({
  schemaVersion: "v1" as const,
  conversationId: "conversation-1",
  companyId: "company-1",
  currentFocus: {
    kind: "none" as const,
    entityIds: [],
  },
  pendingClarification: {
    active: false,
  },
  freshness: {
    status: "stale" as const,
  },
  sourceOfTruthMarkers: {},
  heuristicHints: {
    usedQuotedReference: false,
    topCandidates: [],
  },
});

const createAssistantSemanticRecordStub = (
  args: StubArgs = {},
): AssistantSemanticRecordDto => ({
  id: "assistant-semantic-record-1",
  schemaVersion: "v1",
  companyId: String(args.companyId ?? "company-1"),
  conversationId: String(args.conversationId ?? "conversation-1"),
  assistantMessageId: String(args.assistantMessageId ?? "message-1"),
  actionType: "none",
  normalizedAction: "answer",
  semanticRecordStatus: "complete",
  presentedNumberedList: false,
  orderedPresentedEntityIds: [],
  displayIndexToEntityIdMap: [],
  referencedEntities: [],
  responseLanguage: "en",
  responseMode: "grounded",
  groundingSourceMetadata: {
    usedRetrieval: true,
    usedConversationState: false,
    usedSummary: false,
    retrievalMode: "raw_latest_message",
    groundedEntityIds: [],
  },
  stateMutationHints: {
    focusEntityIds: [],
    shouldSetPendingClarification: false,
  },
  createdAt: Number(args.createdAt ?? 1_000),
});

const createConversationSummaryStub = (
  args: StubArgs = {},
): ConversationSummaryDto => ({
  summaryId: String(args.summaryId ?? "summary-1"),
  conversationId: String(args.conversationId ?? "conversation-1"),
  stablePreferences: [],
  importantResolvedDecisions: [],
  historicalContextNeededForFutureTurns: [],
  freshness: {
    status: "fresh",
    updatedAt: 2_000,
  },
  provenance: {
    source: "system_seed",
    generatedAt: 2_000,
  },
  coveredMessageRange: {},
});

const createQuotedReferenceStub = () => ({
  transportMessageId: "quoted-1",
  conversationMessageId: "message-quoted-1",
  role: "assistant" as const,
  text: "Quoted assistant reply",
  referencedEntities: [{
    entityKind: "product" as const,
    entityId: "product-1",
    source: "semantic_assistant_record" as const,
    confidence: "high" as const,
  }],
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

      if (isAssistantSemanticRecordMutation(stubArgs)) {
        return createAssistantSemanticRecordStub(stubArgs);
      }

      if (isConversationSummaryMutation(stubArgs)) {
        return createConversationSummaryStub(stubArgs);
      }

      if (isAnalyticsMutation(stubArgs)) {
        return undefined;
      }

      if (isCanonicalStateMutation(stubArgs)) {
        return createCanonicalStateStub();
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

      if (isQuotedReferenceQuery(stubArgs)) {
        return createQuotedReferenceStub();
      }

      if (isSemanticAssistantRecordsQuery(stubArgs)) {
        return [createAssistantSemanticRecordStub(stubArgs)];
      }

      if (isConversationSummaryQuery(stubArgs)) {
        return createConversationSummaryStub(stubArgs);
      }

      if (isInboundPromptHistoryQuery(stubArgs)) {
        return {
          turns: [],
          selectionMode: "no_history",
          usedQuotedReference: false,
        };
      }

      if (isCanonicalStateQuery(stubArgs)) {
        return {
          state: createCanonicalStateStub(),
          invalidatedPaths: [],
        };
      }

      if (isConversationQuery(stubArgs)) {
        return createActionConversationStub();
      }

      if (isListQuery(stubArgs)) {
        return [];
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
    await store.getCanonicalConversationState({
      companyId: "company-1",
      conversationId: "conversation-1",
      now: 2_600,
    });
    await store.getQuotedReferenceContext({
      companyId: "company-1",
      conversationId: "conversation-1",
      referencedTransportMessageId: "quoted-1",
    });
    await store.listRelevantAssistantSemanticRecords({
      companyId: "company-1",
      conversationId: "conversation-1",
      limit: 5,
      beforeTimestamp: 2_550,
    });
    await store.getLatestConversationSummary({
      companyId: "company-1",
      conversationId: "conversation-1",
    });
    await store.applyCanonicalConversationTurnOutcome({
      companyId: "company-1",
      conversationId: "conversation-1",
      responseLanguage: "en",
      latestUserMessageText: "hello",
      assistantActionType: "none",
      committedAssistantTimestamp: 2_650,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      referencedTransportMessageId: "quoted-4",
      retrievalOutcome: "grounded",
      candidates: [{
        entityKind: "product",
        entityId: "product-1",
        score: 0.9,
      }],
    });
    await store.persistAssistantSemanticRecord({
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "message-1",
      schemaVersion: "v1",
      actionType: "none",
      normalizedAction: "answer",
      semanticRecordStatus: "complete",
      presentedNumberedList: false,
      orderedPresentedEntityIds: [],
      displayIndexToEntityIdMap: [],
      referencedEntities: [],
      responseLanguage: "en",
      responseMode: "grounded",
      groundingSourceMetadata: {
        usedRetrieval: true,
        usedConversationState: false,
        usedSummary: false,
        retrievalMode: "raw_latest_message",
        groundedEntityIds: [],
      },
      stateMutationHints: {
        focusEntityIds: [],
        shouldSetPendingClarification: false,
      },
      createdAt: 2_700,
    });
    await store.upsertConversationSummary({
      companyId: "company-1",
      conversationId: "conversation-1",
      summaryId: "summary-1",
      stablePreferences: [],
      importantResolvedDecisions: [],
      historicalContextNeededForFutureTurns: [],
      freshness: {
        status: "fresh",
        updatedAt: 2_800,
      },
      provenance: {
        source: "system_seed",
        generatedAt: 2_800,
      },
      coveredMessageRange: {},
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
    expect(mutationCalls).toHaveLength(15);
    expect(queryCalls).toHaveLength(8);
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

  test("creates a fresh client for each store operation", async () => {
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

    expect(createdClients).toHaveLength(3);
    expect(createdClients).toEqual([client, client, client]);
  });

  test("forwards canonical state reads and writes to Convex", async () => {
    const { client, mutationCalls, queryCalls } = createClientStub();
    const store = createConvexConversationStore({
      createClient: () => client as never,
    });

    await store.getCanonicalConversationState({
      companyId: "company-1",
      conversationId: "conversation-1",
      now: 2_000,
    });
    await store.applyCanonicalConversationTurnOutcome({
      companyId: "company-1",
      conversationId: "conversation-1",
      responseLanguage: "ar",
      latestUserMessageText: "الثاني",
      assistantActionType: "clarify",
      committedAssistantTimestamp: 2_100,
      promptHistorySelectionMode: "quoted_reference_window",
      usedQuotedReference: true,
      referencedTransportMessageId: "quoted-1",
      retrievalOutcome: "low_signal",
      candidates: [{
        entityKind: "product",
        entityId: "product-1",
        score: 0.42,
      }],
    });

    expect(queryCalls.at(-1)).toEqual({
      companyId: "company-1",
      conversationId: "conversation-1",
      now: 2_000,
    });
    expect(mutationCalls.at(-1)).toEqual({
      companyId: "company-1",
      conversationId: "conversation-1",
      responseLanguage: "ar",
      latestUserMessageText: "الثاني",
      assistantActionType: "clarify",
      committedAssistantTimestamp: 2_100,
      promptHistorySelectionMode: "quoted_reference_window",
      usedQuotedReference: true,
      referencedTransportMessageId: "quoted-1",
      retrievalOutcome: "low_signal",
      candidates: [{
        entityKind: "product",
        entityId: "product-1",
        score: 0.42,
      }],
    });
  });

  test("forwards turn-resolution context reads and semantic persistence writes to Convex", async () => {
    const { client, mutationCalls, queryCalls } = createClientStub();
    const store = createConvexConversationStore({
      createClient: () => client as never,
    });

    await store.getQuotedReferenceContext({
      companyId: "company-1",
      conversationId: "conversation-1",
      referencedTransportMessageId: "quoted-1",
    });
    await store.listRelevantAssistantSemanticRecords({
      companyId: "company-1",
      conversationId: "conversation-1",
      limit: 4,
      beforeTimestamp: 2_000,
    });
    await store.getLatestConversationSummary({
      companyId: "company-1",
      conversationId: "conversation-1",
    });
    await store.persistAssistantSemanticRecord({
      companyId: "company-1",
      conversationId: "conversation-1",
      assistantMessageId: "message-1",
      schemaVersion: "v1",
      actionType: "clarify",
      normalizedAction: "clarify",
      semanticRecordStatus: "complete",
      presentedNumberedList: true,
      orderedPresentedEntityIds: ["product-1", "product-2"],
      displayIndexToEntityIdMap: [
        { displayIndex: 1, entityId: "product-1" },
        { displayIndex: 2, entityId: "product-2" },
      ],
      presentedList: {
        kind: "product",
        items: [
          { displayIndex: 1, entityKind: "product", entityId: "product-1", score: 0.9 },
          { displayIndex: 2, entityKind: "product", entityId: "product-2", score: 0.8 },
        ],
      },
      referencedEntities: [
        { entityKind: "product", entityId: "product-1", source: "raw_text", confidence: "high" },
      ],
      resolvedStandaloneQueryUsed: {
        text: "burger box",
        status: "used",
      },
      responseLanguage: "en",
      responseMode: "clarified",
      groundingSourceMetadata: {
        usedRetrieval: true,
        usedConversationState: true,
        usedSummary: false,
        retrievalMode: "raw_latest_message",
        groundedEntityIds: ["product-1", "product-2"],
      },
      clarificationRationale: {
        reasonCode: "assistant_action",
      },
      stateMutationHints: {
        focusKind: "product",
        focusEntityIds: ["product-1", "product-2"],
        shouldSetPendingClarification: true,
        latestStandaloneQueryText: "burger box",
      },
      createdAt: 2_100,
    });
    await store.upsertConversationSummary({
      companyId: "company-1",
      conversationId: "conversation-1",
      summaryId: "summary-2",
      durableCustomerGoal: "Find burger box sizes",
      stablePreferences: ["Arabic replies"],
      importantResolvedDecisions: [{
        summary: "Customer wants a burger box",
      }],
      historicalContextNeededForFutureTurns: ["Previously compared burger box sizes"],
      freshness: {
        status: "fresh",
        updatedAt: 2_200,
      },
      provenance: {
        source: "summary_job",
        generatedAt: 2_200,
      },
      coveredMessageRange: {
        fromMessageId: "message-1",
        toMessageId: "message-9",
        messageCount: 9,
      },
    });

    expect(queryCalls).toEqual([
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        referencedTransportMessageId: "quoted-1",
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        limit: 4,
        beforeTimestamp: 2_000,
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
      },
    ]);
    expect(mutationCalls).toEqual([
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        assistantMessageId: "message-1",
        schemaVersion: "v1",
        actionType: "clarify",
        normalizedAction: "clarify",
        semanticRecordStatus: "complete",
        presentedNumberedList: true,
        orderedPresentedEntityIds: ["product-1", "product-2"],
        displayIndexToEntityIdMap: [
          { displayIndex: 1, entityId: "product-1" },
          { displayIndex: 2, entityId: "product-2" },
        ],
        presentedList: {
          kind: "product",
          items: [
            { displayIndex: 1, entityKind: "product", entityId: "product-1", score: 0.9 },
            { displayIndex: 2, entityKind: "product", entityId: "product-2", score: 0.8 },
          ],
        },
        referencedEntities: [
          { entityKind: "product", entityId: "product-1", source: "raw_text", confidence: "high" },
        ],
        resolvedStandaloneQueryUsed: {
          text: "burger box",
          status: "used",
        },
        responseLanguage: "en",
        responseMode: "clarified",
        groundingSourceMetadata: {
          usedRetrieval: true,
          usedConversationState: true,
          usedSummary: false,
          retrievalMode: "raw_latest_message",
          groundedEntityIds: ["product-1", "product-2"],
        },
        clarificationRationale: {
          reasonCode: "assistant_action",
        },
        stateMutationHints: {
          focusKind: "product",
          focusEntityIds: ["product-1", "product-2"],
          shouldSetPendingClarification: true,
          latestStandaloneQueryText: "burger box",
        },
        createdAt: 2_100,
      },
      {
        companyId: "company-1",
        conversationId: "conversation-1",
        summaryId: "summary-2",
        durableCustomerGoal: "Find burger box sizes",
        stablePreferences: ["Arabic replies"],
        importantResolvedDecisions: [{
          summary: "Customer wants a burger box",
        }],
        historicalContextNeededForFutureTurns: ["Previously compared burger box sizes"],
        freshness: {
          status: "fresh",
          updatedAt: 2_200,
        },
        provenance: {
          source: "summary_job",
          generatedAt: 2_200,
        },
        coveredMessageRange: {
          fromMessageId: "message-1",
          toMessageId: "message-9",
          messageCount: 9,
        },
      },
    ]);
  });

  test("retries transient Convex transport failures with a fresh client", async () => {
    const firstError = Object.assign(
      new Error("The socket connection was closed unexpectedly"),
      { code: "ECONNRESET" },
    );
    const actionCalls: unknown[] = [];
    const createdClients: StubConvexAdminClient[] = [
      {
        action: async () => {
          throw firstError;
        },
        mutation: async () => createMessageStub(),
        query: async () => [],
      },
      {
        action: async (_reference, args) => {
          actionCalls.push(args);
          return createActionConversationStub();
        },
        mutation: async () => createMessageStub(),
        query: async () => [],
      },
    ];

    const store = createConvexConversationStore({
      createClient: () => {
        const client = createdClients.shift();
        if (!client) {
          throw new Error("No client available");
        }

        return client as never;
      },
    });

    const conversation = await store.getOrCreateActiveConversation("company-1", "967700000001");

    expect(conversation.id).toBe("conversation-1");
    expect(actionCalls).toHaveLength(1);
  });

  test("does not retry non-transient Convex failures", async () => {
    const createdClients: StubConvexAdminClient[] = [
      {
        action: async () => {
          throw new Error("Conversation not found for company");
        },
        mutation: async () => createMessageStub(),
        query: async () => [],
      },
    ];

    const store = createConvexConversationStore({
      createClient: () => {
        const client = createdClients.shift();
        if (!client) {
          throw new Error("No client available");
        }

        return client as never;
      },
    });

    await expect(store.getOrCreateActiveConversation("company-1", "967700000001")).rejects.toThrow(
      "Conversation not found for company",
    );
    expect(createdClients).toHaveLength(0);
  });
});
