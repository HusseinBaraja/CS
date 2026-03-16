import {
  createCompanySessionKey,
  DEFAULT_COMPANY_TIMEZONE,
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
