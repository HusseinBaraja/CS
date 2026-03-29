/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { createCompanySessionKey } from '@cs/shared';
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
        ownerPhone: "967784338919",
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
    expect(profiles.map((profile: { name: string }) => profile.name)).toEqual([
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
    expect(profiles.every((profile: { sessionKey: string }) => profile.sessionKey.startsWith("company-"))).toBe(true);
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

  it("upserts and clears one pairing artifact row per company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Pairing Tenant",
        ownerPhone: "966500000914",
        config: {
          botEnabled: true,
        },
      }),
    );

    await t.mutation(internal.companyRuntime.upsertBotRuntimePairingArtifact, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-Y29tcGFueS0x",
      qrText: "qr-one",
      updatedAt: 1_000,
      expiresAt: 61_000,
    });
    await t.mutation(internal.companyRuntime.upsertBotRuntimePairingArtifact, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-Y29tcGFueS0x",
      qrText: "qr-two",
      updatedAt: 2_000,
      expiresAt: 62_000,
    });

    let rows = await t.run(async (ctx) => ctx.db.query("botRuntimePairingArtifacts").collect());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-Y29tcGFueS0x",
      qrText: "qr-two",
      updatedAt: 2_000,
      expiresAt: 62_000,
    });

    await t.mutation(internal.companyRuntime.clearBotRuntimePairingArtifact, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
    });

    rows = await t.run(async (ctx) => ctx.db.query("botRuntimePairingArtifacts").collect());
    expect(rows).toHaveLength(0);
  });

  it("only clears pairing artifacts that belong to the requested runtime owner", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Owner Scoped Pairing Tenant",
        ownerPhone: "966500000921",
        botRuntimePairingLeaseOwner: "runtime-owner-2",
        botRuntimePairingLeaseExpiresAt: Date.now() + 60_000,
        config: {
          botEnabled: true,
        },
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-owner-1",
        qrText: "qr-one",
        updatedAt: 1_000,
        expiresAt: 61_000,
      });
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-owner-2",
        qrText: "qr-two",
        updatedAt: 2_000,
        expiresAt: 62_000,
      });
    });

    await t.mutation(internal.companyRuntime.clearBotRuntimePairingArtifact, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
    });

    const rows = await t.run(async (ctx) => ctx.db.query("botRuntimePairingArtifacts").collect());
    const company = await t.run(async (ctx) => ctx.db.get(companyId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId,
      runtimeOwnerId: "runtime-owner-2",
      sessionKey: "company-owner-2",
    });
    expect(company?.botRuntimePairingLeaseExpiresAt).toBeGreaterThan(Date.now());
  });

  it("releases the company pairing lease when clearing the last pairing artifact", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Pairing Lease Clear Tenant",
        ownerPhone: "966500000925",
        botRuntimePairingLeaseOwner: "runtime-owner-1",
        botRuntimePairingLeaseExpiresAt: Date.now() + 60_000,
        config: {
          botEnabled: true,
        },
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-lease",
        qrText: "qr-lease",
        updatedAt: 1_000,
        expiresAt: 61_000,
      });
    });

    await t.mutation(internal.companyRuntime.clearBotRuntimePairingArtifact, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
    });

    await expect(
      t.mutation(internal.companyRuntime.upsertBotRuntimePairingArtifact, {
        companyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-lease",
        qrText: "qr-next",
        updatedAt: 2_000,
        expiresAt: 62_000,
      }),
    ).resolves.toMatchObject({
      companyId,
      runtimeOwnerId: "runtime-owner-2",
      sessionKey: "company-lease",
      qrText: "qr-next",
    });
  });

  it("clears pairing artifacts for one company across all runtime owners and expires the lease", async () => {
    const t = convexTest(schema, modules);
    const nowBeforeClear = Date.now();

    const [firstCompanyId, secondCompanyId] = await Promise.all([
      t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Startup Cleanup Tenant",
          ownerPhone: "966500000923",
          botRuntimePairingLeaseOwner: "runtime-owner-1",
          botRuntimePairingLeaseExpiresAt: Date.now() + 60_000,
          config: {
            botEnabled: true,
          },
        })
      ),
      t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Other Pairing Tenant",
          ownerPhone: "966500000924",
          config: {
            botEnabled: true,
          },
        })
      ),
    ]);

    await t.run(async (ctx) => {
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId: firstCompanyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-first-owner-1",
        qrText: "qr-one",
        updatedAt: 1_000,
        expiresAt: 61_000,
      });
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId: firstCompanyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-first-owner-2",
        qrText: "qr-two",
        updatedAt: 2_000,
        expiresAt: 62_000,
      });
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId: secondCompanyId,
        runtimeOwnerId: "runtime-owner-3",
        sessionKey: "company-second-owner-3",
        qrText: "qr-three",
        updatedAt: 3_000,
        expiresAt: 63_000,
      });
    });

    await t.mutation(internal.companyRuntime.clearBotRuntimePairingArtifactsByCompany, {
      companyId: firstCompanyId,
    });

    const rows = await t.run(async (ctx) => ctx.db.query("botRuntimePairingArtifacts").collect());
    const firstCompany = await t.run(async (ctx) => ctx.db.get(firstCompanyId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId: secondCompanyId,
      runtimeOwnerId: "runtime-owner-3",
      sessionKey: "company-second-owner-3",
    });
    expect(firstCompany?.botRuntimePairingLeaseExpiresAt).toBeLessThanOrEqual(Date.now());
    expect(firstCompany?.botRuntimePairingLeaseExpiresAt).toBeGreaterThanOrEqual(nowBeforeClear);
  });

  it("clears runtime session rows for one company only", async () => {
    const t = convexTest(schema, modules);
    const nowBeforeClear = Date.now();

    const [firstCompanyId, secondCompanyId] = await Promise.all([
      t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "First Session Tenant",
          ownerPhone: "966500000918",
          botRuntimeSessionLeaseOwner: "runtime-owner-1",
          botRuntimeSessionLeaseExpiresAt: 999_999,
          config: {
            botEnabled: true,
          },
        })
      ),
      t.run(async (ctx) =>
        ctx.db.insert("companies", {
          name: "Second Session Tenant",
          ownerPhone: "966500000919",
          config: {
            botEnabled: true,
          },
        })
      ),
    ]);

    await t.run(async (ctx) => {
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
        state: "connecting",
        attempt: 1,
        hasQr: false,
        updatedAt: 2_000,
        leaseExpiresAt: 62_000,
      });
    });

    await t.mutation(internal.companyRuntime.clearBotRuntimeSession, {
      companyId: firstCompanyId,
      runtimeOwnerId: "runtime-owner-1",
    });

    const rows = await t.run(async (ctx) => ctx.db.query("botRuntimeSessions").collect());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId: secondCompanyId,
      runtimeOwnerId: "runtime-owner-2",
      sessionKey: "company-second",
    });

    const firstCompany = await t.run(async (ctx) => ctx.db.get(firstCompanyId));
    expect(firstCompany?.botRuntimeSessionLeaseExpiresAt).toBeLessThanOrEqual(Date.now());
    expect(firstCompany?.botRuntimeSessionLeaseExpiresAt).toBeGreaterThanOrEqual(nowBeforeClear);
  });

  it("releases the company session lease when clearing runtime sessions", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Lease Clear Tenant",
        ownerPhone: "966500000920",
        botRuntimeSessionLeaseOwner: "runtime-owner-1",
        botRuntimeSessionLeaseExpiresAt: Date.now() + 60_000,
        config: {
          botEnabled: true,
        },
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("botRuntimeSessions", {
        companyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-lease",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      });
    });

    await t.mutation(internal.companyRuntime.clearBotRuntimeSession, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
    });

    await expect(
      t.mutation(internal.companyRuntime.upsertBotRuntimeSession, {
        companyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-lease",
        state: "connecting",
        attempt: 1,
        hasQr: false,
        updatedAt: 2_000,
        leaseExpiresAt: 62_000,
      }),
    ).resolves.toMatchObject({
      companyId,
      runtimeOwnerId: "runtime-owner-2",
      sessionKey: "company-lease",
    });
  });

  it("only clears runtime sessions that belong to the requested runtime owner", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Owner Scoped Session Tenant",
        ownerPhone: "966500000922",
        botRuntimeSessionLeaseOwner: "runtime-owner-1",
        botRuntimeSessionLeaseExpiresAt: Date.now() + 60_000,
        config: {
          botEnabled: true,
        },
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("botRuntimeSessions", {
        companyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-owner-1",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      });
      await ctx.db.insert("botRuntimeSessions", {
        companyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-owner-2",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 2_000,
        leaseExpiresAt: 62_000,
      });
    });

    await t.mutation(internal.companyRuntime.clearBotRuntimeSession, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
    });

    const rows = await t.run(async (ctx) => ctx.db.query("botRuntimeSessions").collect());
    const company = await t.run(async (ctx) => ctx.db.get(companyId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId,
      runtimeOwnerId: "runtime-owner-2",
      sessionKey: "company-owner-2",
    });
    expect(company?.botRuntimeSessionLeaseExpiresAt).toBeGreaterThan(Date.now());
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

  it("releases all pairing artifacts for an owner", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const firstCompanyId = await ctx.db.insert("companies", {
        name: "First Pairing Tenant",
        ownerPhone: "966500000915",
      });
      const secondCompanyId = await ctx.db.insert("companies", {
        name: "Second Pairing Tenant",
        ownerPhone: "966500000916",
      });

      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId: firstCompanyId,
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-first",
        qrText: "qr-first",
        updatedAt: 1_000,
        expiresAt: 61_000,
      });
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId: secondCompanyId,
        runtimeOwnerId: "runtime-owner-2",
        sessionKey: "company-second",
        qrText: "qr-second",
        updatedAt: 1_000,
        expiresAt: 61_000,
      });
    });

    await t.mutation(internal.companyRuntime.releaseBotRuntimePairingArtifactsByOwner, {
      runtimeOwnerId: "runtime-owner-1",
    });

    const rows = await t.run(async (ctx) => ctx.db.query("botRuntimePairingArtifacts").collect());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.runtimeOwnerId).toBe("runtime-owner-2");
  });

  it("lists operator snapshots with active pairing artifacts only", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Snapshot Tenant",
        ownerPhone: "966500000917",
        timezone: "Asia/Aden",
        config: {
          botEnabled: true,
        },
      }),
    );
    const sessionKey = createCompanySessionKey(companyId as string);

    await t.mutation(internal.companyRuntime.upsertBotRuntimeSession, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey,
      state: "awaiting_pairing",
      attempt: 1,
      hasQr: true,
      updatedAt: 2_000,
      leaseExpiresAt: 62_000,
    });

    await t.mutation(internal.companyRuntime.upsertBotRuntimePairingArtifact, {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey,
      qrText: "active-qr",
      updatedAt: 3_000,
      expiresAt: 63_000,
    });

    const activeSnapshots = await t.query(internal.companyRuntime.listBotRuntimeOperatorSnapshots, {});

    expect(activeSnapshots).toEqual([
      {
        companyId,
        name: "Snapshot Tenant",
        ownerPhone: "966500000917",
        timezone: "Asia/Aden",
        config: {
          botEnabled: true,
        },
        sessionKey,
        session: {
          companyId,
          runtimeOwnerId: "runtime-owner-1",
          sessionKey,
          state: "awaiting_pairing",
          attempt: 1,
          hasQr: true,
          updatedAt: 2_000,
          leaseExpiresAt: 62_000,
        },
        pairing: {
          updatedAt: 3_000,
          expiresAt: 63_000,
          qrText: "active-qr",
        },
      },
    ]);
  });
});
