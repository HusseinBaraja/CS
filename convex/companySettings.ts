import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { missingPricePolicyValidator } from './schema';

export type MissingPricePolicy = 'reply_unavailable' | 'handoff';

export type CompanySettingsDto = {
  id: Id<'companySettings'> | null;
  companyId: string;
  missingPricePolicy: MissingPricePolicy;
};

const DEFAULT_MISSING_PRICE_POLICY: MissingPricePolicy = 'reply_unavailable';
const COMPANY_SETTINGS_LOCK_LEASE_MS = 15_000;

const getCompanySettingsLockKey = (companyId: Id<'companies'>): string =>
  `companySettings:${companyId}`;

const listSettingsForCompany = async (
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  companyId: Id<'companies'>,
) =>
  ctx.db
    .query('companySettings')
    .withIndex('by_company', (q) => q.eq('companyId', companyId))
    .collect();

const chooseCanonicalByCreation = <T extends { _creationTime: number; _id: string }>(
  rows: T[],
) =>
  [...rows].sort((left, right) =>
    left._creationTime - right._creationTime || left._id.localeCompare(right._id),
  )[0];

const chooseCanonicalSettings = (
  settings: Awaited<ReturnType<typeof listSettingsForCompany>>,
) => chooseCanonicalByCreation(settings);

const collapseSettingsRows = async (
  ctx: Pick<MutationCtx, 'db'>,
  settingsRows: Awaited<ReturnType<typeof listSettingsForCompany>>,
  missingPricePolicy: MissingPricePolicy,
) => {
  const canonical = chooseCanonicalSettings(settingsRows);
  if (!canonical) {
    return null;
  }

  await ctx.db.patch(canonical._id, { missingPricePolicy });
  await Promise.all(
    settingsRows
      .filter((settings) => settings._id !== canonical._id)
      .map((settings) => ctx.db.delete(settings._id)),
  );

  return canonical;
};

const acquireCompanySettingsLock = async (
  ctx: Pick<MutationCtx, 'db'>,
  companyId: Id<'companies'>,
  ownerToken: string,
  now: number,
): Promise<string> => {
  const key = getCompanySettingsLockKey(companyId);
  const locks = await ctx.db
    .query('jobLocks')
    .withIndex('by_key', (q) => q.eq('key', key))
    .collect();
  const lock = chooseCanonicalByCreation(locks);

  if (!lock) {
    await ctx.db.insert('jobLocks', {
      key,
      ownerToken,
      acquiredAt: now,
      expiresAt: now + COMPANY_SETTINGS_LOCK_LEASE_MS,
    });
    return key;
  }

  if (lock.ownerToken !== ownerToken && lock.expiresAt > now) {
    throw new Error(`Company settings upsert already in progress for companyId=${companyId}`);
  }

  await ctx.db.patch(lock._id, {
    ownerToken,
    acquiredAt: now,
    expiresAt: now + COMPANY_SETTINGS_LOCK_LEASE_MS,
  });

  await Promise.all(
    locks.filter((row) => row._id !== lock._id).map((row) => ctx.db.delete(row._id)),
  );

  return key;
};

const releaseCompanySettingsLock = async (
  ctx: Pick<MutationCtx, 'db'>,
  key: string,
  ownerToken: string,
): Promise<void> => {
  const locks = await ctx.db
    .query('jobLocks')
    .withIndex('by_key', (q) => q.eq('key', key))
    .collect();

  await Promise.all(
    locks
      .filter((lock) => lock.ownerToken === ownerToken)
      .map((lock) => ctx.db.delete(lock._id)),
  );
};

export const getSettingsForCompany = async (
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  companyId: Id<'companies'>,
): Promise<CompanySettingsDto | null> => {
  const company = await ctx.db.get(companyId);
  if (!company) {
    return null;
  }

  const settings = chooseCanonicalSettings(await listSettingsForCompany(ctx, companyId));

  if (!settings) {
    return {
      id: null,
      companyId,
      missingPricePolicy: DEFAULT_MISSING_PRICE_POLICY,
    };
  }

  return {
    id: settings._id,
    companyId: settings.companyId,
    missingPricePolicy: settings.missingPricePolicy,
  };
};

export const get = internalQuery({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args): Promise<CompanySettingsDto | null> =>
    getSettingsForCompany(ctx, args.companyId),
});

export const upsert = internalMutation({
  args: {
    companyId: v.id('companies'),
    missingPricePolicy: missingPricePolicyValidator,
  },
  handler: async (ctx, args): Promise<CompanySettingsDto | null> => {
    const ownerToken = crypto.randomUUID();
    const lockKey = await acquireCompanySettingsLock(ctx, args.companyId, ownerToken, Date.now());

    try {
      const company = await ctx.db.get(args.companyId);
      if (!company) {
        return null;
      }

      const settingsRows = await listSettingsForCompany(ctx, args.companyId);
      const existing = chooseCanonicalSettings(settingsRows);

      if (existing) {
        await collapseSettingsRows(ctx, settingsRows, args.missingPricePolicy);
        return {
          id: existing._id,
          companyId: existing.companyId,
          missingPricePolicy: args.missingPricePolicy,
        };
      }

      const settingsId = await ctx.db.insert('companySettings', {
        companyId: args.companyId,
        missingPricePolicy: args.missingPricePolicy,
      });

      const canonical = await collapseSettingsRows(
        ctx,
        await listSettingsForCompany(ctx, args.companyId),
        args.missingPricePolicy,
      );

      return {
        id: canonical?._id ?? settingsId,
        companyId: args.companyId,
        missingPricePolicy: args.missingPricePolicy,
      };
    } finally {
      await releaseCompanySettingsLock(ctx, lockKey, ownerToken);
    }
  },
});
