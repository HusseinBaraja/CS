import { v } from 'convex/values';
import { DEFAULT_COMPANY_SETTINGS, type MissingPricePolicy } from '@cs/shared';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { missingPricePolicyValidator } from './schema';
import {
  acquireCompanySettingsLock,
  chooseCanonicalSettings,
  collapseSettingsRows,
  listSettingsForCompany,
  releaseCompanySettingsLock,
  resolveOperatingCurrency,
  sanitizeMaxAutomatedMessageChars,
  sanitizeOperatingCurrency,
} from './companySettingsHelpers';

export type CompanySettingsDto = {
  id: Id<'companySettings'> | null;
  companyId: string;
  missingPricePolicy: MissingPricePolicy;
  maxAutomatedMessageChars: number;
  operatingCurrency?: string;
};

export const getSettingsForCompany = async (
  ctx: Parameters<typeof listSettingsForCompany>[0],
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
      missingPricePolicy: DEFAULT_COMPANY_SETTINGS.missingPricePolicy,
      maxAutomatedMessageChars: DEFAULT_COMPANY_SETTINGS.maxAutomatedMessageChars,
      ...(DEFAULT_COMPANY_SETTINGS.operatingCurrency ? {
        operatingCurrency: DEFAULT_COMPANY_SETTINGS.operatingCurrency,
      } : {}),
    };
  }

  return {
    id: settings._id,
    companyId: settings.companyId,
    missingPricePolicy: settings.missingPricePolicy,
    maxAutomatedMessageChars: sanitizeMaxAutomatedMessageChars(
      settings.maxAutomatedMessageChars,
    ),
    ...(sanitizeOperatingCurrency(settings.operatingCurrency) ? {
      operatingCurrency: sanitizeOperatingCurrency(settings.operatingCurrency),
    } : {}),
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
    maxAutomatedMessageChars: v.optional(v.number()),
    operatingCurrency: v.optional(v.string()),
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
      const maxAutomatedMessageChars = sanitizeMaxAutomatedMessageChars(
        args.maxAutomatedMessageChars ?? existing?.maxAutomatedMessageChars,
      );
      const operatingCurrency = resolveOperatingCurrency(
        args.operatingCurrency,
        existing?.operatingCurrency,
      );

      if (existing) {
        await collapseSettingsRows(
          ctx,
          settingsRows,
          args.missingPricePolicy,
          maxAutomatedMessageChars,
          operatingCurrency,
        );
        return {
          id: existing._id,
          companyId: existing.companyId,
          missingPricePolicy: args.missingPricePolicy,
          maxAutomatedMessageChars,
          ...(operatingCurrency ? { operatingCurrency } : {}),
        };
      }

      const settingsId = await ctx.db.insert('companySettings', {
        companyId: args.companyId,
        missingPricePolicy: args.missingPricePolicy,
        maxAutomatedMessageChars,
        ...(operatingCurrency ? { operatingCurrency } : {}),
      });

      const canonical = await collapseSettingsRows(
        ctx,
        await listSettingsForCompany(ctx, args.companyId),
        args.missingPricePolicy,
        maxAutomatedMessageChars,
        operatingCurrency,
      );

      return {
        id: canonical?._id ?? settingsId,
        companyId: args.companyId,
        missingPricePolicy: args.missingPricePolicy,
        maxAutomatedMessageChars,
        ...(operatingCurrency ? { operatingCurrency } : {}),
      };
    } finally {
      await releaseCompanySettingsLock(ctx, lockKey, ownerToken);
    }
  },
});
