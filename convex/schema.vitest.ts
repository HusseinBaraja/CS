/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';
import { createCategory, createCompany, createProduct, createVariant } from './testFixtures';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("convex schema", () => {
  // ── Companies ──────────────────────────────────────────────────────────
  describe("companies", () => {
    it("inserts a valid company", async () => {
      const t = convexTest(schema, modules);
      const { companyId: id, company } = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Demo Packaging Co",
        }),
      );
      expect(id).toBeDefined();

      const doc = await t.run(async (ctx) => ctx.db.get(id));
      expect(doc).toMatchObject({
        name: company.name,
        ownerPhone: company.ownerPhone,
      });
    });

    it("inserts a company with optional config and timezone", async () => {
      const t = convexTest(schema, modules);
      const { companyId: id } = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Test Co",
          config: { welcomeEnabled: true, maxRetries: 3 },
          timezone: "Asia/Aden",
        }),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(id));
      expect(doc?.config).toEqual({ welcomeEnabled: true, maxRetries: 3 });
      expect(doc?.timezone).toBe("Asia/Aden");
    });
  });

  describe("jobLocks", () => {
    it("inserts and queries a job lock by key", async () => {
      const t = convexTest(schema, modules);
      const id = await t.run(async (ctx) =>
        ctx.db.insert("jobLocks", {
          key: "seedSampleData",
          ownerToken: "owner-1",
          acquiredAt: 1_000,
          expiresAt: 2_000,
        }),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(id));
      expect(doc).toMatchObject({
        key: "seedSampleData",
        ownerToken: "owner-1",
      });

      const locks = await t.run(async (ctx) =>
        ctx.db
          .query("jobLocks")
          .withIndex("by_key", (q) => q.eq("key", "seedSampleData"))
          .collect(),
      );

      expect(locks).toHaveLength(1);
      expect(locks[0]?._id).toBe(id);
    });
  });

  // ── Categories ─────────────────────────────────────────────────────────
  describe("categories", () => {
    it("inserts a category linked to a company", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Test Co",
        }).then(({ companyId }) => companyId),
      );

      const catId = await t.run(async (ctx) =>
        createCategory(ctx, {
          companyId,
          nameEn: "Containers",
          nameAr: "حاويات",
        }).then(({ categoryId }) => categoryId),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(catId));
      expect(doc).toMatchObject({
        companyId,
        nameEn: "Containers",
        nameAr: "حاويات",
      });
    });
  });

  // ── Products ───────────────────────────────────────────────────────────
  describe("products", () => {
    it("inserts a product with all optional fields", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Test Co",
        }).then(({ companyId }) => companyId),
      );
      const catId = await t.run(async (ctx) =>
        createCategory(ctx, { companyId, nameEn: "Cups" }).then(({ categoryId }) => categoryId),
      );

      const productId = await t.run(async (ctx) =>
        createProduct(ctx, {
          companyId,
          categoryId: catId,
          nameEn: "Paper Cup 8oz",
          nameAr: "كوب ورقي 8 أونس",
          descriptionEn: "Standard paper cup",
          price: 0.15,
          currency: "SAR",
        }).then(({ productId }) => productId),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(productId));
      expect(doc).toMatchObject({
        nameEn: "Paper Cup 8oz",
        price: 0.15,
        currency: "SAR",
      });
    });
  });

  // ── Product Variants ──────────────────────────────────────────────────
  describe("productVariants", () => {
    it("inserts a variant linked to a product", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Test Co",
        }).then(({ companyId }) => companyId),
      );
      const catId = await t.run(async (ctx) =>
        createCategory(ctx, { companyId, nameEn: "Cups" }).then(({ categoryId }) => categoryId),
      );
      const productId = await t.run(async (ctx) =>
        createProduct(ctx, {
          companyId,
          categoryId: catId,
          nameEn: "Paper Cup",
        }).then(({ productId }) => productId),
      );

      const variantId = await t.run(async (ctx) =>
        createVariant(ctx, { companyId, productId,
          label: "Large White",
          price: 0.2,
        }).then(({ variantId }) => variantId),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(variantId));
      expect(doc).toMatchObject({
        label: "Large White",
        });
    });

    it("rejects a variant companyId that does not match the product", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Product Company",
        }).then(({ companyId }) => companyId),
      );
      const otherCompanyId = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Other Company",
        }).then(({ companyId }) => companyId),
      );
      const catId = await t.run(async (ctx) =>
        createCategory(ctx, { companyId, nameEn: "Cups" }).then(({ categoryId }) => categoryId),
      );
      const productId = await t.run(async (ctx) =>
        createProduct(ctx, {
          companyId,
          categoryId: catId,
          nameEn: "Paper Cup",
        }).then(({ productId }) => productId),
      );

      await expect(
        t.run(async (ctx) =>
          createVariant(ctx, {
            companyId: otherCompanyId,
            productId,
            label: "Large White",
          }),
        ),
      ).rejects.toThrow("Variant companyId must match the product companyId");
    });
  });

  // ── Conversations & Messages ──────────────────────────────────────────
  describe("conversations & messages", () => {
    it("inserts a conversation and messages", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      const convId = await t.run(async (ctx) =>
        ctx.db.insert("conversations", {
          companyId,
          phoneNumber: "967771234567",
          muted: false,
        }),
      );

      await t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          conversationId: convId,
          role: "user",
          content: "Do you have burger boxes?",
          timestamp: Date.now(),
        });
        await ctx.db.insert("messages", {
          conversationId: convId,
          role: "assistant",
          content: "Yes! We have 3 sizes.",
          timestamp: Date.now() + 1,
        });
      });

      const messages = await t.run(async (ctx) =>
        ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", convId))
          .collect(),
      );
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe("user");
    });

    it("queries conversations by the new index", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      await t.run(async (ctx) => {
        await ctx.db.insert("conversations", {
          companyId,
          phoneNumber: "123",
          muted: false,
        });
        await ctx.db.insert("conversations", {
          companyId,
          phoneNumber: "456",
          muted: true,
        });
      });

      const mutedConversations = await t.run(async (ctx) =>
        ctx.db
          .query("conversations")
          .withIndex("by_company_phone_and_muted", (q) =>
            q
              .eq("companyId", companyId)
              .eq("phoneNumber", "456")
              .eq("muted", true),
          )
          .collect(),
      );
      expect(mutedConversations).toHaveLength(1);
      expect(mutedConversations[0]?.phoneNumber).toBe("456");
    });
  });

  // ── Offers ─────────────────────────────────────────────────────────────
  describe("offers", () => {
    it("inserts an active offer", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      await t.run(async (ctx) =>
        ctx.db.insert("offers", {
          companyId,
          contentEn: "20% off all containers!",
          contentAr: "خصم 20% على جميع الحاويات!",
          active: true,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        }),
      );

      const activeOffers = await t.run(async (ctx) =>
        ctx.db
          .query("offers")
          .withIndex("by_company_active", (q) =>
            q.eq("companyId", companyId).eq("active", true),
          )
          .collect(),
      );
      expect(activeOffers).toHaveLength(1);
      expect(activeOffers[0]?.contentEn).toBe("20% off all containers!");
    });

    it("filters inactive offers correctly", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      // Insert one active and one inactive offer
      await t.run(async (ctx) => {
        await ctx.db.insert("offers", {
          companyId,
          contentEn: "Active offer",
          active: true,
        });
        await ctx.db.insert("offers", {
          companyId,
          contentEn: "Inactive offer",
          active: false,
        });
      });

      const activeOffers = await t.run(async (ctx) =>
        ctx.db
          .query("offers")
          .withIndex("by_company_active", (q) =>
            q.eq("companyId", companyId).eq("active", true),
          )
          .collect(),
      );
      const inactiveOffers = await t.run(async (ctx) =>
        ctx.db
          .query("offers")
          .withIndex("by_company_active", (q) =>
            q.eq("companyId", companyId).eq("active", false),
          )
          .collect(),
      );

      expect(activeOffers).toHaveLength(1);
      expect(activeOffers[0]?.contentEn).toBe("Active offer");
      expect(inactiveOffers).toHaveLength(1);
      expect(inactiveOffers[0]?.contentEn).toBe("Inactive offer");
    });
  });

  // ── Currency Rates ─────────────────────────────────────────────────────
  describe("currencyRates", () => {
    it("inserts and queries a currency rate by pair", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      await t.run(async (ctx) =>
        ctx.db.insert("currencyRates", {
          companyId,
          fromCurrency: "SAR",
          toCurrency: "YER",
          rate: 425,
        }),
      );

      const rates = await t.run(async (ctx) =>
        ctx.db
          .query("currencyRates")
          .withIndex("by_company_pair", (q) =>
            q
              .eq("companyId", companyId)
              .eq("fromCurrency", "SAR")
              .eq("toCurrency", "YER"),
          )
          .collect(),
      );
      expect(rates).toHaveLength(1);
      expect(rates[0]?.rate).toBe(425);
    });
  });

  // ── Analytics Events ──────────────────────────────────────────────────
  describe("analyticsEvents", () => {
    it("inserts an analytics event with typed payload", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      const timestamp = Date.now();
      await t.run(async (ctx) =>
        ctx.db.insert("analyticsEvents", {
          companyId,
          eventType: "product_search",
          timestamp,
          payload: { query: "burger boxes", resultCount: 3 },
        }),
      );

      const events = await t.run(async (ctx) =>
        ctx.db
          .query("analyticsEvents")
          .withIndex("by_company_type", (q) =>
            q.eq("companyId", companyId).eq("eventType", "product_search"),
          )
          .collect(),
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toEqual({
        query: "burger boxes",
        resultCount: 3,
      });
      expect(events[0]?.timestamp).toBe(timestamp);
    });

    it("queries events by time range efficiently", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      // Insert events at different times
      await t.run(async (ctx) => {
        await ctx.db.insert("analyticsEvents", {
          companyId,
          eventType: "product_view",
          timestamp: sevenDaysAgo,
          payload: { productId: "old" },
        });
        await ctx.db.insert("analyticsEvents", {
          companyId,
          eventType: "product_view",
          timestamp: twoDaysAgo,
          payload: { productId: "recent" },
        });
        await ctx.db.insert("analyticsEvents", {
          companyId,
          eventType: "product_view",
          timestamp: now,
          payload: { productId: "current" },
        });
      });

      // Query events from last 3 days using time-based index
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
      const recentEvents = await t.run(async (ctx) =>
        ctx.db
          .query("analyticsEvents")
          .withIndex("by_company_type_time", (q) =>
            q
              .eq("companyId", companyId)
              .eq("eventType", "product_view")
              .gte("timestamp", threeDaysAgo),
          )
          .collect(),
      );

      expect(recentEvents).toHaveLength(2);
      expect(recentEvents.map((e) => e.payload?.productId)).toContain("recent");
      expect(recentEvents.map((e) => e.payload?.productId)).toContain(
        "current",
      );
    });
  });

  // ── Embeddings ─────────────────────────────────────────────────────────
  describe("embeddings", () => {
    const companyLanguage = (companyId: string, language: string): string =>
      `${companyId}:${language}`;

    it("inserts an embedding document", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );
      const catId = await t.run(async (ctx) =>
        ctx.db.insert("categories", { companyId, nameEn: "Cups" }),
      );
      const productId = await t.run(async (ctx) =>
        ctx.db.insert("products", {
          companyId,
          categoryId: catId,
          nameEn: "Paper Cup",
        }),
      );

      // 768-dimension dummy vector
      const embedding = Array.from({ length: 768 }, (_, i) => i * 0.001);

      const embId = await t.run(async (ctx) =>
        ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding,
          textContent: "Paper Cup 8oz for hot beverages",
          language: "en",
          companyLanguage: companyLanguage(companyId, "en"),
        }),
      );

      // Insert another embedding with a different language to test filtering
      await t.run(async (ctx) =>
        ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding,
          textContent: "كوب ورقي",
          language: "ar",
          companyLanguage: companyLanguage(companyId, "ar"),
        }),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(embId));
      expect(doc?.embedding).toHaveLength(768);
      expect(doc?.language).toBe("en");

      const results = await t.action(api.vectorSearch.vectorSearchByEmbedding, {
        companyId,
        language: "en",
        embedding,
        count: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?._id).toBe(embId);
    });

    it("applies the language filter during vector search", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );
      const catId = await t.run(async (ctx) =>
        ctx.db.insert("categories", { companyId, nameEn: "Cups" }),
      );
      const productId = await t.run(async (ctx) =>
        ctx.db.insert("products", {
          companyId,
          categoryId: catId,
          nameEn: "Paper Cup",
        }),
      );

      const queryEmbedding = [1, ...Array.from({ length: 767 }, () => 0)];
      const higherRankedArabicEmbedding = [
        1,
        ...Array.from({ length: 767 }, () => 0),
      ];
      const lowerRankedEnglishEmbedding = [
        0.8,
        0.6,
        ...Array.from({ length: 766 }, () => 0),
      ];

      await t.run(async (ctx) => {
        for (let i = 0; i < 5; i += 1) {
          await ctx.db.insert("embeddings", {
            companyId,
            productId,
            embedding: higherRankedArabicEmbedding,
            textContent: `Arabic embedding ${i}`,
            language: "ar",
            companyLanguage: companyLanguage(companyId, "ar"),
          });
        }
      });

      const englishEmbeddingId = await t.run(async (ctx) =>
        ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding: lowerRankedEnglishEmbedding,
          textContent: "English embedding",
          language: "en",
          companyLanguage: companyLanguage(companyId, "en"),
        }),
      );

      const results = await t.action(api.vectorSearch.vectorSearchByEmbedding, {
        companyId,
        language: "en",
        embedding: queryEmbedding,
        count: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?._id).toBe(englishEmbeddingId);
    });
  });
});



