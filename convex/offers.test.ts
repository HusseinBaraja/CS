/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("convex offers", () => {
  it("lists only currently active offers by default", async () => {
    const t = convexTest(schema, modules);
    const now = Date.UTC(2026, 2, 12, 12, 0, 0);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000700",
      });

      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Active now",
        active: true,
        startDate: now - 60_000,
        endDate: now + 60_000,
      });
      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Inactive flag",
        active: false,
      });
      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Starts later",
        active: true,
        startDate: now + 60_000,
      });
      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Ended earlier",
        active: true,
        endDate: now - 60_000,
      });

      return companyId;
    });

    const offers = await t.query(internal.offers.list, {
      companyId,
      now,
    });

    expect(offers).toHaveLength(1);
    expect(offers?.[0]).toMatchObject({
      companyId,
      contentEn: "Active now",
      active: true,
      isCurrentlyActive: true,
    });
  });

  it("returns all company offers for management clients and computes isCurrentlyActive", async () => {
    const t = convexTest(schema, modules);
    const now = Date.UTC(2026, 2, 12, 12, 0, 0);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000701",
      });

      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Oldest",
        active: true,
        endDate: now - 1,
      });
      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Middle",
        active: false,
      });
      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Newest",
        active: true,
      });

      return companyId;
    });

    const offers = await t.query(internal.offers.list, {
      companyId,
      activeOnly: false,
      now,
    });

    expect(offers?.map((offer: { contentEn: string }) => offer.contentEn)).toEqual([
      "Newest",
      "Middle",
      "Oldest",
    ]);
    expect(offers?.map((offer: { isCurrentlyActive: boolean }) => offer.isCurrentlyActive)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("creates an offer and trims strings", async () => {
    const t = convexTest(schema, modules);
    const now = 150;

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000702",
      }),
    );

    const offer = await t.mutation(internal.offers.create, {
      companyId,
      contentEn: "  Weekend sale  ",
      contentAr: "  خصم نهاية الأسبوع  ",
      active: true,
      startDate: 100,
      endDate: 200,
      now,
    });

    expect(offer).toEqual({
      id: offer?.id,
      companyId,
      contentEn: "Weekend sale",
      contentAr: "خصم نهاية الأسبوع",
      active: true,
      startDate: 100,
      endDate: 200,
      isCurrentlyActive: true,
    });
  });

  it("updates an offer and clears nullable fields", async () => {
    const t = convexTest(schema, modules);

    const { companyId, offerId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000703",
      });
      const offerId = await ctx.db.insert("offers", {
        companyId,
        contentEn: "Sale",
        contentAr: "عرض",
        active: true,
        startDate: 100,
        endDate: 200,
      });

      return {
        companyId,
        offerId,
      };
    });

    const offer = await t.mutation(internal.offers.update, {
      companyId,
      offerId,
      contentAr: null,
      startDate: null,
      endDate: null,
      active: false,
    });
    const storedOffer = await t.run(async (ctx) => ctx.db.get(offerId));

    expect(offer).toEqual({
      id: offerId,
      companyId,
      contentEn: "Sale",
      active: false,
      isCurrentlyActive: false,
    });
    expect(storedOffer).toEqual({
      _id: offerId,
      _creationTime: expect.any(Number),
      companyId,
      contentEn: "Sale",
      active: false,
    });
  });

  it("uses the injected now value when returning an updated offer", async () => {
    const t = convexTest(schema, modules);

    const { companyId, offerId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000709",
      });
      const offerId = await ctx.db.insert("offers", {
        companyId,
        contentEn: "Sale",
        active: true,
        startDate: 100,
        endDate: 200,
      });

      return {
        companyId,
        offerId,
      };
    });

    const offer = await t.mutation(internal.offers.update, {
      companyId,
      offerId,
      contentEn: "Updated sale",
      now: 150,
    });

    expect(offer).toEqual({
      id: offerId,
      companyId,
      contentEn: "Updated sale",
      active: true,
      startDate: 100,
      endDate: 200,
      isCurrentlyActive: true,
    });
  });

  it("rejects invalid date ranges", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000704",
      }),
    );

    await expect(
      t.mutation(internal.offers.create, {
        companyId,
        contentEn: "Bad window",
        active: true,
        startDate: 200,
        endDate: 100,
      }),
    ).rejects.toThrow("VALIDATION_FAILED: startDate must be less than or equal to endDate");
  });

  it("returns null when listing a missing company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Deleted Tenant",
        ownerPhone: "966500000705",
      });
      await ctx.db.delete(companyId);
      return companyId;
    });

    const offers = await t.query(internal.offers.list, {
      companyId,
    });

    expect(offers).toBeNull();
  });

  it("returns null for out-of-scope update and delete operations", async () => {
    const t = convexTest(schema, modules);

    const { otherCompanyId, offerId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000706",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000707",
      });
      const offerId = await ctx.db.insert("offers", {
        companyId,
        contentEn: "Scoped",
        active: true,
      });

      return {
        otherCompanyId,
        offerId,
      };
    });

    const updated = await t.mutation(internal.offers.update, {
      companyId: otherCompanyId,
      offerId,
      contentEn: "Hidden",
    });
    const deleted = await t.mutation(internal.offers.remove, {
      companyId: otherCompanyId,
      offerId,
    });

    expect(updated).toBeNull();
    expect(deleted).toBeNull();
  });

  it("evaluates active windows using the injected now value", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000708",
      });

      await ctx.db.insert("offers", {
        companyId,
        contentEn: "Timed",
        active: true,
        startDate: 100,
        endDate: 200,
      });

      return companyId;
    });

    const beforeWindow = await t.query(internal.offers.list, {
      companyId,
      activeOnly: false,
      now: 50,
    });
    const insideWindow = await t.query(internal.offers.list, {
      companyId,
      activeOnly: false,
      now: 150,
    });
    const afterWindow = await t.query(internal.offers.list, {
      companyId,
      activeOnly: false,
      now: 250,
    });

    expect(beforeWindow?.[0]?.isCurrentlyActive).toBe(false);
    expect(insideWindow?.[0]?.isCurrentlyActive).toBe(true);
    expect(afterWindow?.[0]?.isCurrentlyActive).toBe(false);
  });
});
