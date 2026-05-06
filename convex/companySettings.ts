import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';

export type MissingPricePolicy = 'reply_unavailable' | 'handoff';

const missingPricePolicyValidator = v.union(
  v.literal('reply_unavailable'),
  v.literal('handoff'),
);

export type CompanySettingsDto = {
  id: string;
  companyId: string;
  missingPricePolicy: MissingPricePolicy;
};

const DEFAULT_MISSING_PRICE_POLICY: MissingPricePolicy = 'reply_unavailable';

export const getSettingsForCompany = async (
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  companyId: Id<'companies'>,
): Promise<CompanySettingsDto | null> => {
  const company = await ctx.db.get(companyId);
  if (!company) {
    return null;
  }

  const settings = await ctx.db
    .query('companySettings')
    .withIndex('by_company', (q) => q.eq('companyId', companyId))
    .unique();

  if (!settings) {
    return {
      id: '',
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
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return null;
    }

    const existing = await ctx.db
      .query('companySettings')
      .withIndex('by_company', (q) => q.eq('companyId', args.companyId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        missingPricePolicy: args.missingPricePolicy,
      });
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

    return {
      id: settingsId,
      companyId: args.companyId,
      missingPricePolicy: args.missingPricePolicy,
    };
  },
});
