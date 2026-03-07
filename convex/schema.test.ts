/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("convex schema", () => {
  // ── Companies ──────────────────────────────────────────────────────────
  describe("companies", () => {
    it("inserts a valid company", async () => {
      const t = convexTest(schema, modules);
      const id = await t.run(async (ctx) => {
        return ctx.db.insert("companies", {
          name: "Demo Packaging Co",
          ownerPhone: "966500000000",
        });
      });
      expect(id).toBeDefined();

      const doc = await t.run(async (ctx) => ctx.db.get(id));
      expect(doc).toMatchObject({
        name: "Demo Packaging Co",
        ownerPhone: "966500000000",
      });
    });

    it("inserts a company with optional config and timezone", async () => {
      const t = convexTest(schema, modules);
      const id = await t.run(async (ctx) => {
        return ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000001",
          config: { welcomeEnabled: true, maxRetries: 3 },
          timezone: "Asia/Aden",
        });
      });

      const doc = await t.run(async (ctx) => ctx.db.get(id));
      expect(doc?.config).toEqual({ welcomeEnabled: true, maxRetries: 3 });
      expect(doc?.timezone).toBe("Asia/Aden");
    });
  });

  // ── Categories ─────────────────────────────────────────────────────────
  describe("categories", () => {
    it("inserts a category linked to a company", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Test Co",
          ownerPhone: "966500000000",
        }),
      );

      const catId = await t.run(async (ctx) =>
        ctx.db.insert("categories", {
          companyId,
          nameEn: "Containers",
          nameAr: "حاويات",
        }),
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
          nameEn: "Paper Cup 8oz",
          nameAr: "كوب ورقي 8 أونس",
          descriptionEn: "Standard paper cup",
          specifications: { size: "8oz", material: "paper" },
          basePrice: 0.15,
          baseCurrency: "SAR",
          imageUrls: ["https://r2.example.com/cup.jpg"],
        }),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(productId));
      expect(doc).toMatchObject({
        nameEn: "Paper Cup 8oz",
        basePrice: 0.15,
        baseCurrency: "SAR",
      });
      expect(doc?.imageUrls).toHaveLength(1);
    });
  });

  // ── Product Variants ──────────────────────────────────────────────────
  describe("productVariants", () => {
    it("inserts a variant linked to a product", async () => {
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

      const variantId = await t.run(async (ctx) =>
        ctx.db.insert("productVariants", {
          productId,
          variantLabel: "Large White",
          attributes: { size: "L", color: "White" },
          priceOverride: 0.2,
        }),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(variantId));
      expect(doc).toMatchObject({
        variantLabel: "Large White",
        attributes: { size: "L", color: "White" },
      });
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

      await t.run(async (ctx) =>
        ctx.db.insert("analyticsEvents", {
          companyId,
          eventType: "product_search",
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
    });
  });

  // ── Embeddings ─────────────────────────────────────────────────────────
  describe("embeddings", () => {
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
      const embedding = new Array(768).fill(0).map((_, i) => i * 0.001);

      const embId = await t.run(async (ctx) =>
        ctx.db.insert("embeddings", {
          companyId,
          productId,
          embedding,
          textContent: "Paper Cup 8oz for hot beverages",
          language: "en",
        }),
      );

      const doc = await t.run(async (ctx) => ctx.db.get(embId));
      expect(doc?.embedding).toHaveLength(768);
      expect(doc?.language).toBe("en");
    });
  });
});
