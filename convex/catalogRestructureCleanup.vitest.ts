/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("catalog restructure cleanup", () => {
  it("normalizes a zero limit before batching", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Deleted Tenant",
        ownerPhone: "966500000810",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "Orphan Category",
      });
      await ctx.db.delete(companyId);
    });

    const result = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 0,
    });
    const categories = await t.run(async (ctx) => ctx.db.query("categories").collect());

    expect(result.orphanDeleted).toBe(1);
    expect(categories).toHaveLength(0);
  });

  it("returns continuations across one-document pages", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Deleted Tenant",
        ownerPhone: "966500000811",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "First Orphan Category",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "Second Orphan Category",
      });
      await ctx.db.insert("categories", {
        companyId,
        nameEn: "Third Orphan Category",
      });
      await ctx.db.delete(companyId);
    });

    const firstResult = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 1,
    });
    expect(firstResult).toMatchObject({
      processed: 1,
      orphanDeleted: 1,
      nextTable: "categories",
    });

    const secondResult = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 1,
      table: firstResult.nextTable ?? undefined,
      cursor: firstResult.nextCursor ?? undefined,
    });
    const thirdResult = await t.mutation(internal.catalogRestructureCleanup.run, {
      limit: 1,
      table: secondResult.nextTable ?? undefined,
      cursor: secondResult.nextCursor ?? undefined,
    });
    const categories = await t.run(async (ctx) => ctx.db.query("categories").collect());

    expect(secondResult.orphanDeleted).toBe(1);
    expect(thirdResult.orphanDeleted).toBe(1);
    expect(categories).toHaveLength(0);
  });
});
