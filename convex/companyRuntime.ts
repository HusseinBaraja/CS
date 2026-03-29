import {
  BOT_RUNTIME_SESSION_STATES,
  createCompanySessionKey,
  DEFAULT_COMPANY_TIMEZONE,
  type BotRuntimeOperatorSnapshot,
  type BotRuntimePairingArtifact,
  type BotRuntimeSessionRecord,
  type CompanyRuntimeConfig,
  type CompanyRuntimeProfile,
} from '@cs/shared';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';

const [
  initializingState,
  connectingState,
  awaitingPairingState,
  openState,
  reconnectingState,
  closedState,
  loggedOutState,
  failedState,
] = BOT_RUNTIME_SESSION_STATES;

const botRuntimeSessionStateValidator = v.union(
  v.literal(initializingState),
  v.literal(connectingState),
  v.literal(awaitingPairingState),
  v.literal(openState),
  v.literal(reconnectingState),
  v.literal(closedState),
  v.literal(loggedOutState),
  v.literal(failedState),
);

const BOT_RUNTIME_COMPANY_LEASE_MS = 5_000;

type LeaseKind = "session" | "pairing";

type RuntimeLeaseFieldNames = {
  expiresAt: "botRuntimeSessionLeaseExpiresAt" | "botRuntimePairingLeaseExpiresAt";
  owner: "botRuntimeSessionLeaseOwner" | "botRuntimePairingLeaseOwner";
};

const getLeaseFieldNames = (leaseKind: LeaseKind): RuntimeLeaseFieldNames =>
  leaseKind === "session"
    ? {
      expiresAt: "botRuntimeSessionLeaseExpiresAt",
      owner: "botRuntimeSessionLeaseOwner",
    }
    : {
      expiresAt: "botRuntimePairingLeaseExpiresAt",
      owner: "botRuntimePairingLeaseOwner",
    };

const acquireCompanyRuntimeLease = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
  leaseKind: LeaseKind,
  ownerToken: string,
  now: number,
): Promise<boolean> => {
  const company = await ctx.db.get(companyId);
  if (!company) {
    throw new Error(`Company ${companyId} was not found`);
  }

  const fields = getLeaseFieldNames(leaseKind);
  const activeLeaseOwner = company[fields.owner];
  const activeLeaseExpiresAt = company[fields.expiresAt];

  if (
    typeof activeLeaseOwner === "string" &&
    activeLeaseOwner !== ownerToken &&
    typeof activeLeaseExpiresAt === "number" &&
    activeLeaseExpiresAt > now
  ) {
    return false;
  }

  await ctx.db.patch(companyId, {
    [fields.owner]: ownerToken,
    [fields.expiresAt]: now + BOT_RUNTIME_COMPANY_LEASE_MS,
  });
  return true;
};

const releaseCompanyRuntimeLease = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
  leaseKind: LeaseKind,
  ownerToken: string,
  now: number,
): Promise<void> => {
  const company = await ctx.db.get(companyId);
  if (!company) {
    return;
  }

  const fields = getLeaseFieldNames(leaseKind);
  if (company[fields.owner] !== ownerToken) {
    return;
  }

  await ctx.db.patch(companyId, {
    [fields.expiresAt]: now,
  });
};

const loadRuntimeSessionRows = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
) =>
  ctx.db
    .query("botRuntimeSessions")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();

const loadPairingArtifactRows = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
) =>
  ctx.db
    .query("botRuntimePairingArtifacts")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();

const expirePairingLeaseIfNoArtifactsRemain = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
): Promise<void> => {
  const remainingRows = await loadPairingArtifactRows(ctx, companyId);
  if (remainingRows.length > 0) {
    return;
  }

  const company = await ctx.db.get(companyId);
  if (!company) {
    return;
  }

  await ctx.db.patch(companyId, {
    botRuntimePairingLeaseExpiresAt: Date.now(),
  });
};

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
    const leaseAcquired = await acquireCompanyRuntimeLease(
      ctx,
      args.companyId,
      "session",
      args.runtimeOwnerId,
      Date.now(),
    );
    if (!leaseAcquired) {
      const existingRows = await loadRuntimeSessionRows(ctx, args.companyId);
      if (existingRows[0]) {
        return {
          companyId: args.companyId,
          runtimeOwnerId: existingRows[0].runtimeOwnerId,
          sessionKey: existingRows[0].sessionKey,
          state: existingRows[0].state,
          attempt: existingRows[0].attempt,
          hasQr: existingRows[0].hasQr,
          ...(existingRows[0].disconnectCode !== undefined ? { disconnectCode: existingRows[0].disconnectCode } : {}),
          ...(existingRows[0].isNewLogin !== undefined ? { isNewLogin: existingRows[0].isNewLogin } : {}),
          updatedAt: existingRows[0].updatedAt,
          leaseExpiresAt: existingRows[0].leaseExpiresAt,
        };
      }

      throw new Error(`Bot runtime session lease is busy for company ${args.companyId}`);
    }

    try {
      const existingRows = await loadRuntimeSessionRows(ctx, args.companyId);

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
    } finally {
      await releaseCompanyRuntimeLease(ctx, args.companyId, "session", args.runtimeOwnerId, Date.now());
    }
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
    const leaseAcquired = await acquireCompanyRuntimeLease(
      ctx,
      args.companyId,
      "pairing",
      args.runtimeOwnerId,
      Date.now(),
    );
    if (!leaseAcquired) {
      const existingRows = await loadPairingArtifactRows(ctx, args.companyId);
      if (existingRows[0]) {
        return {
          companyId: args.companyId,
          runtimeOwnerId: existingRows[0].runtimeOwnerId,
          sessionKey: existingRows[0].sessionKey,
          qrText: existingRows[0].qrText,
          updatedAt: existingRows[0].updatedAt,
          expiresAt: existingRows[0].expiresAt,
        };
      }

      throw new Error(`Bot runtime pairing lease is busy for company ${args.companyId}`);
    }

    try {
      const existingRows = await loadPairingArtifactRows(ctx, args.companyId);

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
    } finally {
      await releaseCompanyRuntimeLease(ctx, args.companyId, "pairing", args.runtimeOwnerId, Date.now());
    }
  },
});

export const clearBotRuntimePairingArtifact = internalMutation({
  args: {
    companyId: v.id("companies"),
    runtimeOwnerId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const rows = await ctx.db
      .query("botRuntimePairingArtifacts")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    for (const row of rows) {
      if (row.runtimeOwnerId === args.runtimeOwnerId) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

export const clearBotRuntimePairingArtifactsByCompany = internalMutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<void> => {
    const rows = await loadPairingArtifactRows(ctx, args.companyId);

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    await expirePairingLeaseIfNoArtifactsRemain(ctx, args.companyId);
  },
});

export const clearBotRuntimeSession = internalMutation({
  args: {
    companyId: v.id("companies"),
    runtimeOwnerId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const rows = await ctx.db
      .query("botRuntimeSessions")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    for (const row of rows) {
      if (row.runtimeOwnerId === args.runtimeOwnerId) {
        await ctx.db.delete(row._id);
      }
    }

    const remainingRows = await ctx.db
      .query("botRuntimeSessions")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    if (remainingRows.length > 0) {
      return;
    }

    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return;
    }

    await ctx.db.patch(args.companyId, {
      botRuntimeSessionLeaseExpiresAt: Date.now(),
    });
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
  args: {},
  handler: async (ctx): Promise<BotRuntimeOperatorSnapshot[]> => {
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
            updatedAt: pairingArtifact.updatedAt,
            expiresAt: pairingArtifact.expiresAt,
            ...(pairingArtifact.qrText !== undefined ? { qrText: pairingArtifact.qrText } : {}),
          }
          : null,
      };
    });
  },
});
