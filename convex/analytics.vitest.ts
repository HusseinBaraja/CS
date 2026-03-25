/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

const FIXED_NOW = Date.parse("2026-03-12T12:00:00.000Z");

const ZERO_COUNTS = {
  customerMessages: 0,
  assistantMessages: 0,
  totalMessages: 0,
  productSearches: 0,
  clarifications: 0,
  catalogSends: 0,
  imageSends: 0,
  handoffs: 0,
  successfulResponses: 0,
};

const freezeNow = () => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe.skipIf(typeof import.meta.glob !== "function")("convex analytics", () => {
  it("returns a zeroed summary for empty today, week, and month periods", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000800",
        timezone: "Asia/Aden",
      }),
    );

    const todaySummary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });
    const weekSummary = await t.query(internal.analytics.summary, {
      companyId,
      period: "week",
    });
    const monthSummary = await t.query(internal.analytics.summary, {
      companyId,
      period: "month",
    });

    expect(todaySummary).toEqual({
      companyId,
      period: "today",
      timezone: "Asia/Aden",
      window: {
        startAt: "2026-03-11T21:00:00.000Z",
        endAtExclusive: "2026-03-12T21:00:00.000Z",
      },
      counts: ZERO_COUNTS,
      performance: {
        averageResponseTimeMs: 0,
      },
      topProducts: [],
    });
    expect(weekSummary?.window).toEqual({
      startAt: "2026-03-08T21:00:00.000Z",
      endAtExclusive: "2026-03-15T21:00:00.000Z",
    });
    expect(weekSummary?.counts).toEqual(ZERO_COUNTS);
    expect(monthSummary?.window).toEqual({
      startAt: "2026-02-28T21:00:00.000Z",
      endAtExclusive: "2026-03-31T21:00:00.000Z",
    });
    expect(monthSummary?.counts).toEqual(ZERO_COUNTS);
  });

  it("falls back to UTC when the company has no timezone", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "UTC Tenant",
        ownerPhone: "966500000801",
      }),
    );

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.timezone).toBe("UTC");
    expect(summary?.window).toEqual({
      startAt: "2026-03-12T00:00:00.000Z",
      endAtExclusive: "2026-03-13T00:00:00.000Z",
    });
  });

  it("uses company-local day boundaries instead of UTC boundaries", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000802",
        timezone: "Asia/Aden",
      });

      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "customer_message_received",
        timestamp: Date.parse("2026-03-11T20:59:59.000Z"),
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "customer_message_received",
        timestamp: Date.parse("2026-03-11T21:00:00.000Z"),
      });

      return companyId;
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.counts.customerMessages).toBe(1);
    expect(summary?.counts.totalMessages).toBe(1);
  });

  it("ignores events outside the requested window and isolates companies", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000803",
        timezone: "Asia/Aden",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000804",
        timezone: "Asia/Aden",
      });

      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "handoff_started",
        timestamp: Date.parse("2026-03-10T09:00:00.000Z"),
        payload: { reason: "sales" },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "handoff_started",
        timestamp: Date.parse("2026-03-12T09:00:00.000Z"),
        payload: { reason: "sales" },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId: otherCompanyId,
        eventType: "handoff_started",
        timestamp: Date.parse("2026-03-12T09:00:00.000Z"),
        payload: { reason: "other-company" },
      });

      return companyId;
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.counts.handoffs).toBe(1);
  });

  it("aggregates counts and averages successful response times", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000805",
        timezone: "Asia/Aden",
      });

      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "customer_message_received",
        timestamp: Date.parse("2026-03-12T09:00:00.000Z"),
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "assistant_message_sent",
        timestamp: Date.parse("2026-03-12T09:01:00.000Z"),
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "product_search",
        timestamp: Date.parse("2026-03-12T09:02:00.000Z"),
        payload: { query: "burger", resultCount: 2 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "clarification_requested",
        timestamp: Date.parse("2026-03-12T09:03:00.000Z"),
        payload: { reason: "ambiguous", candidateCount: 2 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "catalog_sent",
        timestamp: Date.parse("2026-03-12T09:04:00.000Z"),
        payload: { productCount: 3 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "image_sent",
        timestamp: Date.parse("2026-03-12T09:05:00.000Z"),
        payload: { productId: "missing", imageCount: 2 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "handoff_started",
        timestamp: Date.parse("2026-03-12T09:06:00.000Z"),
        payload: { reason: "sales" },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "ai_response_sent",
        timestamp: Date.parse("2026-03-12T09:07:00.000Z"),
        payload: { responseTimeMs: 1000, provider: "deepseek" },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "ai_response_sent",
        timestamp: Date.parse("2026-03-12T09:08:00.000Z"),
        payload: { responseTimeMs: 2000, provider: "gemini" },
      });

      return companyId;
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.counts).toEqual({
      customerMessages: 1,
      assistantMessages: 1,
      totalMessages: 2,
      productSearches: 1,
      clarifications: 1,
      catalogSends: 1,
      imageSends: 1,
      handoffs: 1,
      successfulResponses: 2,
    });
    expect(summary?.performance.averageResponseTimeMs).toBe(1500);
  });

  it("records analytics events through the internal mutation", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000811",
        timezone: "Asia/Aden",
      }),
    );

    await t.mutation(internal.analytics.recordEvent, {
      companyId,
      eventType: "handoff_started",
      timestamp: Date.parse("2026-03-12T09:06:00.000Z"),
      payload: {
        source: "assistant_action",
      },
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.counts.handoffs).toBe(1);
  });

  it("deduplicates analytics events by idempotency key", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000813",
        timezone: "Asia/Aden",
      }),
    );

    await t.mutation(internal.analytics.recordEvent, {
      companyId,
      eventType: "handoff_started",
      timestamp: Date.parse("2026-03-12T09:06:00.000Z"),
      idempotencyKey: "pendingMessage:message-1:handoff_started",
      payload: {
        source: "assistant_action",
      },
    });
    await t.mutation(internal.analytics.recordEvent, {
      companyId,
      eventType: "handoff_started",
      timestamp: Date.parse("2026-03-12T09:07:00.000Z"),
      idempotencyKey: "pendingMessage:message-1:handoff_started",
      payload: {
        source: "assistant_action",
      },
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });
    const storedEvents = await t.run(async (ctx) => ctx.db.query("analyticsEvents").collect());

    expect(summary?.counts.handoffs).toBe(1);
    expect(storedEvents).toHaveLength(1);
  });

  it("rejects analytics events for unknown companies", async () => {
    freezeNow();
    const t = convexTest(schema, modules);
    const deletedCompanyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000812",
        timezone: "Asia/Aden",
      });
      await ctx.db.delete(companyId);
      return companyId;
    });

    await expect(
      t.mutation(internal.analytics.recordEvent, {
        companyId: deletedCompanyId,
        eventType: "handoff_started",
        timestamp: Date.parse("2026-03-12T09:06:00.000Z"),
      }),
    ).rejects.toThrow("Company not found");
  });

  it("ignores malformed or negative response times", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000806",
        timezone: "Asia/Aden",
      });

      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "ai_response_sent",
        timestamp: Date.parse("2026-03-12T09:07:00.000Z"),
        payload: { responseTimeMs: 1200 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "ai_response_sent",
        timestamp: Date.parse("2026-03-12T09:08:00.000Z"),
        payload: { responseTimeMs: "fast" },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "ai_response_sent",
        timestamp: Date.parse("2026-03-12T09:09:00.000Z"),
        payload: { responseTimeMs: -10 },
      });

      return companyId;
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.counts.successfulResponses).toBe(3);
    expect(summary?.performance.averageResponseTimeMs).toBe(1200);
  });

  it("returns grounded top products only for valid same-company product ids", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000807",
        timezone: "Asia/Aden",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000808",
        timezone: "Asia/Aden",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const otherCategoryId = await ctx.db.insert("categories", {
        companyId: otherCompanyId,
        nameEn: "Cups",
      });
      const productOneId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        nameAr: "علبة برجر",
      });
      const productTwoId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Soup Container",
      });
      const foreignProductId = await ctx.db.insert("products", {
        companyId: otherCompanyId,
        categoryId: otherCategoryId,
        nameEn: "Foreign Product",
      });
      const deletedProductId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Deleted Product",
      });
      await ctx.db.delete(deletedProductId);

      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "product_search",
        timestamp: Date.parse("2026-03-12T09:00:00.000Z"),
        payload: { query: "burger", resultCount: 1, productId: productOneId },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "ai_response_sent",
        timestamp: Date.parse("2026-03-12T09:05:00.000Z"),
        payload: { responseTimeMs: 900, productId: productOneId },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "image_sent",
        timestamp: Date.parse("2026-03-12T09:10:00.000Z"),
        payload: { productId: productTwoId, imageCount: 2 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "catalog_sent",
        timestamp: Date.parse("2026-03-12T09:15:00.000Z"),
        payload: { productId: foreignProductId, productCount: 1 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "clarification_requested",
        timestamp: Date.parse("2026-03-12T09:20:00.000Z"),
        payload: { productId: deletedProductId, candidateCount: 1 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "product_search",
        timestamp: Date.parse("2026-03-12T09:25:00.000Z"),
        payload: { query: "bad", resultCount: 0, productId: "not-a-real-id" },
      });

      return companyId;
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.topProducts).toEqual([
      {
        productId: expect.any(String),
        nameEn: "Burger Box",
        nameAr: "علبة برجر",
        interactionCount: 2,
      },
      {
        productId: expect.any(String),
        nameEn: "Soup Container",
        interactionCount: 1,
      },
    ]);
  });

  it("returns only the top five same-company products sorted by interaction count and recency", async () => {
    freezeNow();
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000809",
        timezone: "Asia/Aden",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000810",
        timezone: "Asia/Aden",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const otherCategoryId = await ctx.db.insert("categories", {
        companyId: otherCompanyId,
        nameEn: "Foreign",
      });
      const [product1, product2, product3, product4, product5, product6] = await Promise.all([
        ctx.db.insert("products", { companyId, categoryId, nameEn: "Burger Box" }),
        ctx.db.insert("products", { companyId, categoryId, nameEn: "Soup Container" }),
        ctx.db.insert("products", { companyId, categoryId, nameEn: "Salad Bowl" }),
        ctx.db.insert("products", { companyId, categoryId, nameEn: "Paper Cup" }),
        ctx.db.insert("products", { companyId, categoryId, nameEn: "Fries Box" }),
        ctx.db.insert("products", { companyId, categoryId, nameEn: "Cake Tray" }),
      ]);
      const foreignProductId = await ctx.db.insert("products", {
        companyId: otherCompanyId,
        categoryId: otherCategoryId,
        nameEn: "Foreign Product",
      });

      const insertProductEvents = async (productId: string, count: number, baseMinute: number) => {
        for (let index = 0; index < count; index += 1) {
          await ctx.db.insert("analyticsEvents", {
            companyId,
            eventType: "product_search",
            timestamp: Date.parse(`2026-03-12T09:${String(baseMinute + index).padStart(2, "0")}:00.000Z`),
            payload: { query: productId, resultCount: 1, productId },
          });
        }
      };

      await insertProductEvents(product1, 4, 0);
      await insertProductEvents(product2, 3, 10);
      await insertProductEvents(product3, 3, 20);
      await insertProductEvents(product4, 2, 30);
      await insertProductEvents(product5, 2, 40);
      await insertProductEvents(product6, 1, 50);
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "catalog_sent",
        timestamp: Date.parse("2026-03-12T09:59:00.000Z"),
        payload: { productId: foreignProductId, productCount: 1 },
      });
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "image_sent",
        timestamp: Date.parse("2026-03-12T09:58:00.000Z"),
        payload: { productId: "not-a-real-id", imageCount: 1 },
      });

      return companyId;
    });

    const summary = await t.query(internal.analytics.summary, {
      companyId,
      period: "today",
    });

    expect(summary?.topProducts).toEqual([
      {
        productId: expect.any(String),
        nameEn: "Burger Box",
        interactionCount: 4,
      },
      {
        productId: expect.any(String),
        nameEn: "Salad Bowl",
        interactionCount: 3,
      },
      {
        productId: expect.any(String),
        nameEn: "Soup Container",
        interactionCount: 3,
      },
      {
        productId: expect.any(String),
        nameEn: "Fries Box",
        interactionCount: 2,
      },
      {
        productId: expect.any(String),
        nameEn: "Paper Cup",
        interactionCount: 2,
      },
    ]);
  });
});
