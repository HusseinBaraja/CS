import {
  createCompanySessionKey,
  DEFAULT_COMPANY_TIMEZONE,
  type BotRuntimeOperatorSnapshot,
  type BotRuntimePairingArtifact,
  type BotRuntimeSessionRecord,
  type CompanyRuntimeConfig,
  type CompanyRuntimeProfile,
} from '@cs/shared';
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

const botRuntimeSessionStateValidator = v.union(
  v.literal("initializing"),
  v.literal("connecting"),
  v.literal("awaiting_pairing"),
  v.literal("open"),
  v.literal("reconnecting"),
  v.literal("closed"),
  v.literal("logged_out"),
  v.literal("failed"),
);

const isBotEnabled = (config: CompanyRuntimeConfig | undefined): boolean =>
  config?.botEnabled === true;

const mapProfile = (
  company: {
    _id: string;
    name: string;
    ownerPhone: string;
    timezone?: string;
    config?: CompanyRuntimeConfig;
  },
): CompanyRuntimeProfile => ({
  companyId: company._id,
  name: company.name,
  ownerPhone: company.ownerPhone,
  timezone: company.timezone ?? DEFAULT_COMPANY_TIMEZONE,
  ...(company.config ? { config: company.config } : {}),
  sessionKey: createCompanySessionKey(company._id),
});

export const listEnabledBotCompanies = internalQuery({
  args: {},
  handler: async (ctx): Promise<CompanyRuntimeProfile[]> => {
    const companies = await ctx.db.query("companies").collect();

    return companies
      .filter((company) => isBotEnabled(company.config as CompanyRuntimeConfig | undefined))
      .map(mapProfile)
      .sort((left, right) => left.name.localeCompare(right.name) || left.companyId.localeCompare(right.companyId));
  },
});

export const upsertBotRuntimeSession = internalMutation({
  args: {
    companyId: v.id("companies"),
    runtimeOwnerId: v.string(),
    sessionKey: v.string(),
    state: botRuntimeSessionStateValidator,
    attempt: v.number(),
    hasQr: v.boolean(),
    disconnectCode: v.optional(v.number()),
    isNewLogin: v.optional(v.boolean()),
    updatedAt: v.number(),
    leaseExpiresAt: v.number(),
  },
  handler: async (ctx, args): Promise<BotRuntimeSessionRecord> => {
    const existingRows = await ctx.db
      .query("botRuntimeSessions")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    if (existingRows.length > 1) {
      throw new Error(`Expected at most one bot runtime session for company ${args.companyId}`);
    }

    const patch = {
      runtimeOwnerId: args.runtimeOwnerId,
      sessionKey: args.sessionKey,
      state: args.state,
      attempt: args.attempt,
      hasQr: args.hasQr,
      updatedAt: args.updatedAt,
      leaseExpiresAt: args.leaseExpiresAt,
      disconnectCode: args.disconnectCode,
      isNewLogin: args.isNewLogin,
    };

    if (existingRows[0]) {
      await ctx.db.patch(existingRows[0]._id, patch);
    } else {
      await ctx.db.insert("botRuntimeSessions", {
        companyId: args.companyId,
        ...patch,
      });
    }

    return {
      companyId: args.companyId,
      runtimeOwnerId: args.runtimeOwnerId,
      sessionKey: args.sessionKey,
      state: args.state,
      attempt: args.attempt,
      hasQr: args.hasQr,
      ...(args.disconnectCode !== undefined ? { disconnectCode: args.disconnectCode } : {}),
      ...(args.isNewLogin !== undefined ? { isNewLogin: args.isNewLogin } : {}),
      updatedAt: args.updatedAt,
      leaseExpiresAt: args.leaseExpiresAt,
    };
  },
});

export const upsertBotRuntimePairingArtifact = internalMutation({
  args: {
    companyId: v.id("companies"),
    runtimeOwnerId: v.string(),
    sessionKey: v.string(),
    qrText: v.string(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args): Promise<BotRuntimePairingArtifact> => {
    const existingRows = await ctx.db
      .query("botRuntimePairingArtifacts")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    if (existingRows.length > 1) {
      throw new Error(`Expected at most one bot runtime pairing artifact for company ${args.companyId}`);
    }

    const patch = {
      runtimeOwnerId: args.runtimeOwnerId,
      sessionKey: args.sessionKey,
      qrText: args.qrText,
      updatedAt: args.updatedAt,
      expiresAt: args.expiresAt,
    };

    if (existingRows[0]) {
      await ctx.db.patch(existingRows[0]._id, patch);
    } else {
      await ctx.db.insert("botRuntimePairingArtifacts", {
        companyId: args.companyId,
        ...patch,
      });
    }

    return {
      companyId: args.companyId,
      runtimeOwnerId: args.runtimeOwnerId,
      sessionKey: args.sessionKey,
      qrText: args.qrText,
      updatedAt: args.updatedAt,
      expiresAt: args.expiresAt,
    };
  },
});

export const clearBotRuntimePairingArtifact = internalMutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<void> => {
    const rows = await ctx.db
      .query("botRuntimePairingArtifacts")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  },
});

export const releaseBotRuntimeSessionsByOwner = internalMutation({
  args: {
    runtimeOwnerId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const rows = await ctx.db
      .query("botRuntimeSessions")
      .withIndex("by_runtime_owner", (q) => q.eq("runtimeOwnerId", args.runtimeOwnerId))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  },
});

export const releaseBotRuntimePairingArtifactsByOwner = internalMutation({
  args: {
    runtimeOwnerId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const rows = await ctx.db
      .query("botRuntimePairingArtifacts")
      .withIndex("by_runtime_owner", (q) => q.eq("runtimeOwnerId", args.runtimeOwnerId))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  },
});

export const listBotRuntimeOperatorSnapshots = internalQuery({
  args: {
    now: v.number(),
  },
  handler: async (ctx, args): Promise<BotRuntimeOperatorSnapshot[]> => {
    const profiles = (await ctx.db.query("companies").collect())
      .filter((company) => isBotEnabled(company.config as CompanyRuntimeConfig | undefined))
      .map(mapProfile)
      .sort((left, right) => left.name.localeCompare(right.name) || left.companyId.localeCompare(right.companyId));
    const sessionRows = await ctx.db.query("botRuntimeSessions").collect();
    const pairingRows = await ctx.db.query("botRuntimePairingArtifacts").collect();

    const sessionsByCompany = new Map<string, BotRuntimeSessionRecord>();
    for (const row of sessionRows) {
      const companyId = row.companyId as string;
      if (sessionsByCompany.has(companyId)) {
        throw new Error(`Expected at most one bot runtime session for company ${companyId}`);
      }

      sessionsByCompany.set(companyId, {
        companyId,
        runtimeOwnerId: row.runtimeOwnerId,
        sessionKey: row.sessionKey,
        state: row.state,
        attempt: row.attempt,
        hasQr: row.hasQr,
        ...(row.disconnectCode !== undefined ? { disconnectCode: row.disconnectCode } : {}),
        ...(row.isNewLogin !== undefined ? { isNewLogin: row.isNewLogin } : {}),
        updatedAt: row.updatedAt,
        leaseExpiresAt: row.leaseExpiresAt,
      });
    }

    const pairingsByCompany = new Map<string, BotRuntimePairingArtifact>();
    for (const row of pairingRows) {
      const companyId = row.companyId as string;
      const existing = pairingsByCompany.get(companyId);
      if (existing) {
        throw new Error(`Expected at most one bot runtime pairing artifact for company ${companyId}`);
      }

      pairingsByCompany.set(companyId, {
        companyId,
        runtimeOwnerId: row.runtimeOwnerId,
        sessionKey: row.sessionKey,
        qrText: row.qrText,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt,
      });
    }

    return profiles.map((profile) => {
      const session = sessionsByCompany.get(profile.companyId) ?? null;
      const pairingArtifact = pairingsByCompany.get(profile.companyId);

      return {
        ...profile,
        session,
        pairing: pairingArtifact
          ? {
            state: pairingArtifact.expiresAt > args.now ? "ready" : "expired",
            updatedAt: pairingArtifact.updatedAt,
            expiresAt: pairingArtifact.expiresAt,
            ...(pairingArtifact.expiresAt > args.now ? { qrText: pairingArtifact.qrText } : {}),
          }
          : {
            state: "none",
          },
      };
    });
  },
});
