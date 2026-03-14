/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("convex currency rates", () => {
  it("lists only rates for the requested company sorted by pair", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant One",
        ownerPhone: "966500000720",
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Tenant Two",
        ownerPhone: "966500000721",
      });

      await ctx.db.insert("currencyRates", {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.75,
      });
      await ctx.db.insert("currencyRates", {
        companyId,
        fromCurrency: "EUR",
        toCurrency: "YER",
        rate: 280.5,
      });
      await ctx.db.insert("currencyRates", {
        companyId: otherCompanyId,
        fromCurrency: "USD",
        toCurrency: "AED",
        rate: 3.67,
      });

      return companyId;
    });

    const currencyRates = await t.query(internal.currencyRates.list, {
      companyId,
    });

    expect(currencyRates).toEqual([
      {
        companyId,
        fromCurrency: "EUR",
        toCurrency: "YER",
        rate: 280.5,
      },
      {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.75,
      },
    ]);
  });

  it("creates a rate via upsert", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000722",
      }),
    );

    const result = await t.mutation(internal.currencyRates.upsert, {
      companyId,
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.75,
    });

    expect(result).toEqual({
      created: true,
      currencyRate: {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.75,
      },
    });
  });

  it("updates an existing rate via upsert", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000723",
      });
      await ctx.db.insert("currencyRates", {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.75,
      });

      return companyId;
    });

    const result = await t.mutation(internal.currencyRates.upsert, {
      companyId,
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.8,
    });

    expect(result).toEqual({
      created: false,
      currencyRate: {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.8,
      },
    });
  });

  it("normalizes currency codes to uppercase", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000724",
      }),
    );

    const result = await t.mutation(internal.currencyRates.upsert, {
      companyId,
      fromCurrency: " usd ",
      toCurrency: " sar ",
      rate: 3.75,
    });

    expect(result?.currencyRate).toEqual({
      companyId,
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.75,
    });
  });

  it("rejects invalid rates", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000725",
      }),
    );

    await expect(
      t.mutation(internal.currencyRates.upsert, {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 0,
      }),
    ).rejects.toThrow("VALIDATION_FAILED: rate must be a finite positive number");
  });

  it("rejects identical normalized currencies", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000726",
      }),
    );

    await expect(
      t.mutation(internal.currencyRates.upsert, {
        companyId,
        fromCurrency: "sar",
        toCurrency: "SAR",
        rate: 1.1,
      }),
    ).rejects.toThrow("VALIDATION_FAILED: fromCurrency and toCurrency must be different");
  });

  it("returns null for a missing company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Deleted Tenant",
        ownerPhone: "966500000727",
      });
      await ctx.db.delete(companyId);
      return companyId;
    });

    const result = await t.mutation(internal.currencyRates.upsert, {
      companyId,
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.75,
    });

    expect(result).toBeNull();
  });

  it("self-heals duplicate historical rows deterministically", async () => {
    const t = convexTest(schema, modules);

    const { companyId, duplicateIds } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000728",
      });
      const firstId = await ctx.db.insert("currencyRates", {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.7,
      });
      const secondId = await ctx.db.insert("currencyRates", {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.71,
      });

      return {
        companyId,
        duplicateIds: [firstId, secondId],
      };
    });

    const sortedDuplicateIds = [...duplicateIds].sort((left, right) => left.localeCompare(right));
    const result = await t.mutation(internal.currencyRates.upsert, {
      companyId,
      fromCurrency: "USD",
      toCurrency: "SAR",
      rate: 3.8,
    });
    const storedRates = await t.run(async (ctx) =>
      ctx.db
        .query("currencyRates")
        .withIndex("by_company_pair", (q) =>
          q.eq("companyId", companyId).eq("fromCurrency", "USD").eq("toCurrency", "SAR"),
        )
        .collect(),
    );

    expect(result).toEqual({
      created: false,
      currencyRate: {
        companyId,
        fromCurrency: "USD",
        toCurrency: "SAR",
        rate: 3.8,
      },
    });
    expect(storedRates).toHaveLength(1);
    expect(sortedDuplicateIds).toContain(storedRates[0]!._id);
    expect(storedRates[0]?.rate).toBe(3.8);
  });
});
