import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, type MutationCtx, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { type CleanupCounts, type CleanupCursor, createEmptyCleanupCounts } from './companyCleanup';

const configValue = v.union(v.string(), v.number(), v.boolean());
const companyConfig = v.record(v.string(), configValue);

type CompanyConfig = Record<string, string | number | boolean>;

type CompanyDto = {
  id: string;
  name: string;
  ownerPhone: string;
  timezone?: string;
  config?: CompanyConfig;
};

type DeleteCompanyResult = {
  companyId: string;
  counts: CleanupCounts;
};

const CONFLICT_PREFIX = "CONFLICT";
const VALIDATION_PREFIX = "VALIDATION_FAILED";

const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

const normalizeRequiredString = (value: string, fieldName: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} is required`);
  }

  return normalized;
};

const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const mapCompany = (company: Doc<"companies">): CompanyDto => ({
  id: company._id,
  name: company.name,
  ownerPhone: company.ownerPhone,
  ...(company.timezone ? { timezone: company.timezone } : {}),
  ...(company.config ? { config: company.config } : {}),
});

const assertOwnerPhoneAvailable = async (
  ctx: MutationCtx,
  ownerPhone: string,
  companyId?: Id<"companies">,
): Promise<void> => {
  const existingCompanies = await ctx.db
    .query("companies")
    .withIndex("by_owner_phone", (q) => q.eq("ownerPhone", ownerPhone))
    .collect();

  const conflictingCompany = existingCompanies.find((company) => company._id !== companyId);
  if (conflictingCompany) {
    throw createTaggedError(CONFLICT_PREFIX, "Owner phone is already assigned to another company");
  }
};

export const list = internalQuery({
  args: {},
  handler: async (ctx): Promise<CompanyDto[]> => {
    const companies = await ctx.db.query("companies").collect();

    return companies
      .map(mapCompany)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  },
});

export const get = internalQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<CompanyDto | null> => {
    const company = await ctx.db.get(args.companyId);
    return company ? mapCompany(company) : null;
  },
});

export const create = internalMutation({
  args: {
    name: v.string(),
    ownerPhone: v.string(),
    timezone: v.optional(v.string()),
    config: v.optional(companyConfig),
  },
  handler: async (ctx, args): Promise<CompanyDto> => {
    const name = normalizeRequiredString(args.name, "name");
    const ownerPhone = normalizeRequiredString(args.ownerPhone, "ownerPhone");
    const timezone = normalizeOptionalString(args.timezone);

    await assertOwnerPhoneAvailable(ctx, ownerPhone);

    const companyId = await ctx.db.insert("companies", {
      name,
      ownerPhone,
      ...(timezone ? { timezone } : {}),
      ...(args.config ? { config: args.config } : {}),
    });

    const company = await ctx.db.get(companyId);
    if (!company) {
      throw new Error("Created company could not be loaded");
    }

    return mapCompany(company);
  },
});

export const update = internalMutation({
  args: {
    companyId: v.id("companies"),
    name: v.optional(v.string()),
    ownerPhone: v.optional(v.string()),
    timezone: v.optional(v.union(v.string(), v.null())),
    config: v.optional(v.union(companyConfig, v.null())),
  },
  handler: async (ctx, args): Promise<CompanyDto | null> => {
    const existingCompany = await ctx.db.get(args.companyId);
    if (!existingCompany) {
      return null;
    }

    const patch: {
      name?: string;
      ownerPhone?: string;
      timezone?: string | undefined;
      config?: CompanyConfig | undefined;
    } = {};

    if (args.name !== undefined) {
      patch.name = normalizeRequiredString(args.name, "name");
    }

    if (args.ownerPhone !== undefined) {
      patch.ownerPhone = normalizeRequiredString(args.ownerPhone, "ownerPhone");
      await assertOwnerPhoneAvailable(ctx, patch.ownerPhone, args.companyId);
    }

    if (args.timezone !== undefined) {
      patch.timezone = normalizeOptionalString(args.timezone);
    }

    if (args.config !== undefined) {
      patch.config = args.config ?? undefined;
    }

    await ctx.db.patch(args.companyId, patch);

    const updatedCompany = await ctx.db.get(args.companyId);
    if (!updatedCompany) {
      throw new Error("Updated company could not be loaded");
    }

    return mapCompany(updatedCompany);
  },
});

export const remove = internalAction({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<DeleteCompanyResult | null> => {
    const exists = await ctx.runQuery(internal.companyCleanup.companyExists, {
      companyId: args.companyId,
    });

    if (!exists) {
      return null;
    }

    const counts = createEmptyCleanupCounts();
    let cursor: CleanupCursor | null = null;

    for (;;) {
      const result = await ctx.runMutation(internal.companyCleanup.clearCompanyDataBatch, {
        companyId: args.companyId,
        ...(cursor ? { cursor } : {}),
      });

      if (result.stage !== "done") {
        counts[result.stage] += result.deletedCount;
      }

      cursor = result.nextCursor;

      if (result.done) {
        break;
      }
    }

    return {
      companyId: args.companyId,
      counts,
    };
  },
});
