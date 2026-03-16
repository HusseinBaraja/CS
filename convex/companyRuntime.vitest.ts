/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("convex companyRuntime", () => {
  it("lists only bot-enabled companies with normalized runtime profiles", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Zulu Packaging",
        ownerPhone: "966500000901",
        config: {
          botEnabled: true,
          welcomesEnabled: true,
        },
      });
      await ctx.db.insert("companies", {
        name: "Alpha Packaging",
        ownerPhone: "966500000902",
        timezone: "Asia/Aden",
        config: {
          botEnabled: true,
        },
      });
      await ctx.db.insert("companies", {
        name: "Disabled Packaging",
        ownerPhone: "966500000903",
        config: {
          botEnabled: false,
        },
      });
      await ctx.db.insert("companies", {
        name: "No Config Packaging",
        ownerPhone: "966500000904",
      });
    });

    const profiles = await t.query(internal.companyRuntime.listEnabledBotCompanies, {});

    expect(profiles).toHaveLength(2);
    expect(profiles.map((profile) => profile.name)).toEqual([
      "Alpha Packaging",
      "Zulu Packaging",
    ]);
    expect(profiles[0]).toMatchObject({
      ownerPhone: "966500000902",
      timezone: "Asia/Aden",
      config: {
        botEnabled: true,
      },
      sessionKey: expect.stringMatching(/^company-/),
    });
    expect(profiles[1]?.timezone).toBe("UTC");
    expect(profiles.every((profile) => profile.sessionKey.startsWith("company-"))).toBe(true);
  });

  it("upserts one runtime session row per company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Runtime Tenant",
        ownerPhone: "966500000910",
        config: {
          botEnabled: true,
        },
      }),
    );

    await t.mutation(internal.companyRuntime.upsertBotRuntimeSession, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-Y29tcGFueS0x",
      state: "connecting",
      attempt: 0,
      hasQr: false,
      updatedAt: 1_000,
      leaseExpiresAt: 61_000,
    });
    await t.mutation(internal.companyRuntime.upsertBotRuntimeSession, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-Y29tcGFueS0x",
      state: "open",
      attempt: 0,
      hasQr: false,
      updatedAt: 2_000,
      leaseExpiresAt: 62_000,
    });

    const rows = await t.run(async (ctx) => ctx.db.query("botRuntimeSessions").collect());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-Y29tcGFueS0x",
      state: "open",
      updatedAt: 2_000,
      leaseExpiresAt: 62_000,
    });
  });

  it("fails fast when duplicate runtime session rows already exist for a company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Duplicate Runtime Tenant",
        ownerPhone: "966500000911",
        config: {
          botEnabled: true,
        },
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("botRuntimeSessions", {
        companyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-1",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      });
      await ctx.db.insert("botRuntimeSessions", {
        companyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-1",
        state: "failed",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_500,
        leaseExpiresAt: 61_500,
      });
    });

    await expect(
      t.mutation(internal.companyRuntime.upsertBotRuntimeSession, {
        companyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-1",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 2_000,
        leaseExpiresAt: 62_000,
      }),
    ).rejects.toThrow("Expected at most one bot runtime session for company");
  });

  it("releases all runtime sessions for an owner", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const firstCompanyId = await ctx.db.insert("companies", {
        name: "First Runtime Tenant",
        ownerPhone: "966500000912",
      });
      const secondCompanyId = await ctx.db.insert("companies", {
        name: "Second Runtime Tenant",
        ownerPhone: "966500000913",
      });

      await ctx.db.insert("botRuntimeSessions", {
        companyId: firstCompanyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-first",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      });
      await ctx.db.insert("botRuntimeSessions", {
        companyId: secondCompanyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-second",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      });
    });

    await t.mutation(internal.companyRuntime.releaseBotRuntimeSessionsByOwner, {
      runtimeOwnerId: "runtime-owner-1",
    });

    const rows = await t.run(async (ctx) => ctx.db.query("botRuntimeSessions").collect());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.runtimeOwnerId).toBe("runtime-owner-2");
  });
});
