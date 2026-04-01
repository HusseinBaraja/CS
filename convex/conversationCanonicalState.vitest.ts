import type { Id } from '@cs/db';
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { STALE_CONTEXT_RESET_MS } from './conversations';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

const createConversationFixture = async (t: ReturnType<typeof convexTest>) => {
  const companyId = await t.run(async (ctx) =>
    ctx.db.insert("companies", {
      name: "Tenant A",
      ownerPhone: "966500000000",
    })
  );
  const conversationId = await t.run(async (ctx) =>
    ctx.db.insert("conversations", {
      companyId,
      phoneNumber: "967700000001",
      muted: false,
    })
  );

  return {
    companyId,
    conversationId,
  };
};

const createProductFixture = async (
  t: ReturnType<typeof convexTest>,
  companyId: Id<"companies">,
  suffix: string,
) => {
  const categoryId = await t.run(async (ctx) =>
    ctx.db.insert("categories", {
      companyId,
      nameEn: `Category ${suffix}`,
    })
  );
  const productId = await t.run(async (ctx) =>
    ctx.db.insert("products", {
      companyId,
      categoryId,
      nameEn: `Product ${suffix}`,
      revision: 1,
      images: [],
    })
  );

  return {
    categoryId,
    productId,
  };
};

describe.skipIf(typeof import.meta.glob !== "function")("conversation canonical state", () => {
  it("returns a seeded default state when none has been stored", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);

    const result = await t.query(internal.conversations.getCanonicalConversationState, {
      companyId,
      conversationId,
      now: 10_000,
    });

    expect(result).toEqual({
      state: {
        schemaVersion: "v1",
        conversationId,
        companyId,
        currentFocus: {
          kind: "none",
          entityIds: [],
        },
        pendingClarification: {
          active: false,
        },
        freshness: {
          status: "stale",
        },
        sourceOfTruthMarkers: {},
        heuristicHints: {
          usedQuotedReference: false,
          topCandidates: [],
        },
      },
      invalidatedPaths: [],
    });
  });

  it("sets authoritative focus for a grounded single-product outcome", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);
    const { productId } = await createProductFixture(t, companyId, "single");

    const result = await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "en",
      latestUserMessageText: "burger box",
      assistantActionType: "none",
      committedAssistantTimestamp: 20_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "grounded",
      candidates: [{
        entityKind: "product",
        entityId: productId,
        score: 0.91,
      }],
    });

    expect(result).toMatchObject({
      schemaVersion: "v1",
      conversationId,
      companyId,
      responseLanguage: "en",
      currentFocus: {
        kind: "product",
        entityIds: [productId],
        source: "retrieval_single_candidate",
        updatedAt: 20_000,
      },
      pendingClarification: {
        active: false,
        updatedAt: 20_000,
      },
      latestStandaloneQuery: {
        text: "burger box",
        status: "unresolved_passthrough",
        source: "system_passthrough",
        updatedAt: 20_000,
      },
      freshness: {
        status: "fresh",
        updatedAt: 20_000,
        activeWindowExpiresAt: 20_000 + STALE_CONTEXT_RESET_MS,
      },
      sourceOfTruthMarkers: {
        responseLanguage: "system_passthrough",
        currentFocus: "retrieval_single_candidate",
        latestStandaloneQuery: "system_passthrough",
      },
      heuristicHints: {
        promptHistorySelectionMode: "recent_window",
        usedQuotedReference: false,
        retrievalOutcome: "grounded",
        topCandidates: [{
          entityKind: "product",
          entityId: productId,
          score: 0.91,
        }],
        heuristicFocus: {
          kind: "product",
          entityIds: [productId],
          source: "heuristic",
          updatedAt: 20_000,
        },
      },
    });
  });

  it("keeps prior authoritative focus while storing a heuristic list proxy for multi-candidate retrieval", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);
    const firstProduct = await createProductFixture(t, companyId, "first");
    const secondProduct = await createProductFixture(t, companyId, "second");
    const thirdProduct = await createProductFixture(t, companyId, "third");

    await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "en",
      latestUserMessageText: "show burger boxes",
      assistantActionType: "none",
      committedAssistantTimestamp: 5_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "grounded",
      candidates: [{
        entityKind: "product",
        entityId: firstProduct.productId,
        score: 0.95,
      }],
    });

    const result = await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "en",
      latestUserMessageText: "which one is larger",
      assistantActionType: "none",
      committedAssistantTimestamp: 8_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "grounded",
      candidates: [
        {
          entityKind: "product",
          entityId: secondProduct.productId,
          score: 0.88,
        },
        {
          entityKind: "product",
          entityId: thirdProduct.productId,
          score: 0.83,
        },
      ],
    });

    expect(result.currentFocus).toEqual({
      kind: "product",
      entityIds: [firstProduct.productId],
      source: "retrieval_single_candidate",
      updatedAt: 5_000,
    });
    expect(result.lastPresentedList).toBeUndefined();
    expect(result.heuristicHints.retrievalOrderListProxy).toEqual({
      kind: "product",
      items: [
        {
          displayIndex: 1,
          entityKind: "product",
          entityId: secondProduct.productId,
          score: 0.88,
        },
        {
          displayIndex: 2,
          entityKind: "product",
          entityId: thirdProduct.productId,
          score: 0.83,
        },
      ],
      source: "heuristic",
      updatedAt: 8_000,
    });
  });

  it("preserves focus and sets pending clarification on clarify actions", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);
    const { productId } = await createProductFixture(t, companyId, "clarify");

    await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "ar",
      latestUserMessageText: "علبة البرجر",
      assistantActionType: "none",
      committedAssistantTimestamp: 1_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "grounded",
      candidates: [{
        entityKind: "product",
        entityId: productId,
        score: 0.97,
      }],
    });

    const result = await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "ar",
      latestUserMessageText: "أي حجم؟",
      assistantActionType: "clarify",
      committedAssistantTimestamp: 4_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "low_signal",
      candidates: [],
    });

    expect(result.currentFocus).toEqual({
      kind: "product",
      entityIds: [productId],
      source: "retrieval_single_candidate",
      updatedAt: 1_000,
    });
    expect(result.pendingClarification).toEqual({
      active: true,
      source: "assistant_action",
      updatedAt: 4_000,
    });
    expect(result.sourceOfTruthMarkers.pendingClarification).toBe("assistant_action");
  });

  it("marks stored focus stale on load without deleting it after the active window expires", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);
    const { productId } = await createProductFixture(t, companyId, "stale");

    await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "en",
      latestUserMessageText: "burger box",
      assistantActionType: "none",
      committedAssistantTimestamp: 10_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "grounded",
      candidates: [{
        entityKind: "product",
        entityId: productId,
        score: 0.92,
      }],
    });

    const result = await t.query(internal.conversations.getCanonicalConversationState, {
      companyId,
      conversationId,
      now: 10_000 + STALE_CONTEXT_RESET_MS + 1,
    });

    expect(result.invalidatedPaths).toEqual([]);
    expect(result.state.currentFocus.entityIds).toEqual([productId]);
    expect(result.state.freshness.status).toBe("stale");
  });

  it("stores quoted-reference metadata as heuristic hints", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);

    const result = await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "en",
      latestUserMessageText: "the second one",
      assistantActionType: "none",
      committedAssistantTimestamp: 11_000,
      promptHistorySelectionMode: "quoted_reference_window",
      usedQuotedReference: true,
      referencedTransportMessageId: "quoted-1",
      retrievalOutcome: "low_signal",
      candidates: [],
    });

    expect(result.heuristicHints).toMatchObject({
      promptHistorySelectionMode: "quoted_reference_window",
      usedQuotedReference: true,
      referencedTransportMessageId: "quoted-1",
      retrievalOutcome: "low_signal",
      topCandidates: [],
    });
  });

  it("sanitizes deleted entity references without crashing", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);
    const { productId } = await createProductFixture(t, companyId, "deleted");

    await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "en",
      latestUserMessageText: "burger box",
      assistantActionType: "none",
      committedAssistantTimestamp: 6_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "grounded",
      candidates: [{
        entityKind: "product",
        entityId: productId,
        score: 0.9,
      }],
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(productId);
    });

    const result = await t.query(internal.conversations.getCanonicalConversationState, {
      companyId,
      conversationId,
      now: 7_000,
    });

    expect(result.state.currentFocus).toEqual({
      kind: "none",
      entityIds: [],
    });
    expect(result.state.heuristicHints.topCandidates).toEqual([]);
    expect(result.invalidatedPaths).toEqual(expect.arrayContaining([
      "currentFocus",
      "heuristicHints.topCandidates",
      "heuristicHints.heuristicFocus",
    ]));
  });

  it("sanitizes malformed entity ids without crashing", async () => {
    const t = convexTest(schema, modules);
    const { companyId, conversationId } = await createConversationFixture(t);

    const mutationResult = await t.mutation(internal.conversations.applyCanonicalConversationTurnOutcome, {
      companyId,
      conversationId,
      responseLanguage: "en",
      latestUserMessageText: "burger box",
      assistantActionType: "none",
      committedAssistantTimestamp: 6_000,
      promptHistorySelectionMode: "recent_window",
      usedQuotedReference: false,
      retrievalOutcome: "grounded",
      candidates: [{
        entityKind: "product",
        entityId: "not-a-convex-id",
        score: 0.9,
      }],
    });

    expect(mutationResult.currentFocus).toEqual({
      kind: "none",
      entityIds: [],
    });
    expect(mutationResult.heuristicHints.topCandidates).toEqual([]);
    expect(mutationResult.heuristicHints.heuristicFocus).toBeUndefined();

    const result = await t.query(internal.conversations.getCanonicalConversationState, {
      companyId,
      conversationId,
      now: 7_000,
    });

    expect(result.state.currentFocus).toEqual({
      kind: "none",
      entityIds: [],
    });
    expect(result.state.heuristicHints.topCandidates).toEqual([]);
    expect(result.invalidatedPaths).toEqual([]);
  });
});
