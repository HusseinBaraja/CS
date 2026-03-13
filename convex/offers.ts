import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';

type OfferDto = {
  id: string;
  companyId: string;
  contentEn: string;
  contentAr?: string;
  active: boolean;
  startDate?: number;
  endDate?: number;
  isCurrentlyActive: boolean;
};

type DeleteOfferResult = {
  offerId: string;
};

type OfferReader = {
  db: Pick<MutationCtx["db"], "get" | "query">;
};

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

const normalizeOptionalTimestamp = (
  value: number | null | undefined,
  fieldName: string,
): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} must be a finite epoch timestamp`);
  }

  return value;
};

const validateDateRange = (startDate: number | undefined, endDate: number | undefined): void => {
  if (startDate !== undefined && endDate !== undefined && startDate > endDate) {
    throw createTaggedError(VALIDATION_PREFIX, "startDate must be less than or equal to endDate");
  }
};

const isOfferCurrentlyActive = (
  offer: Pick<Doc<"offers">, "active" | "startDate" | "endDate">,
  now: number,
): boolean =>
  offer.active &&
  (offer.startDate === undefined || offer.startDate <= now) &&
  (offer.endDate === undefined || offer.endDate >= now);

const mapOffer = (offer: Doc<"offers">, now: number): OfferDto => ({
  id: offer._id,
  companyId: offer.companyId,
  contentEn: offer.contentEn,
  ...(offer.contentAr ? { contentAr: offer.contentAr } : {}),
  active: offer.active,
  ...(offer.startDate !== undefined ? { startDate: offer.startDate } : {}),
  ...(offer.endDate !== undefined ? { endDate: offer.endDate } : {}),
  isCurrentlyActive: isOfferCurrentlyActive(offer, now),
});

const getCompany = async (
  ctx: OfferReader,
  companyId: Id<"companies">,
) => ctx.db.get(companyId);

const getScopedOffer = async (
  ctx: OfferReader,
  companyId: Id<"companies">,
  offerId: Id<"offers">,
): Promise<Doc<"offers"> | null> => {
  const offer = await ctx.db.get(offerId);
  if (!offer || offer.companyId !== companyId) {
    return null;
  }

  return offer;
};

const sortOfferDocs = <T extends { _creationTime: number; _id: string }>(offers: T[]): T[] =>
  offers.sort(
    (left, right) =>
      right._creationTime - left._creationTime || left._id.localeCompare(right._id),
  );

export const list = internalQuery({
  args: {
    companyId: v.id("companies"),
    activeOnly: v.optional(v.boolean()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<OfferDto[] | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const now = args.now ?? Date.now();
    const activeOnly = args.activeOnly ?? true;
    const offers = activeOnly
      ? await ctx.db
        .query("offers")
        .withIndex("by_company_active", (q) =>
          q.eq("companyId", args.companyId).eq("active", true),
        )
        .collect()
      : await ctx.db
        .query("offers")
        .withIndex("by_company_active", (q) => q.eq("companyId", args.companyId))
        .collect();

    return sortOfferDocs(offers)
      .filter((offer) => !activeOnly || isOfferCurrentlyActive(offer, now))
      .map((offer) => mapOffer(offer, now));
  },
});

export const create = internalMutation({
  args: {
    companyId: v.id("companies"),
    contentEn: v.string(),
    contentAr: v.optional(v.string()),
    active: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<OfferDto | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const now = args.now ?? Date.now();
    const contentEn = normalizeRequiredString(args.contentEn, "contentEn");
    const contentAr = normalizeOptionalString(args.contentAr);
    const startDate = normalizeOptionalTimestamp(args.startDate, "startDate");
    const endDate = normalizeOptionalTimestamp(args.endDate, "endDate");
    validateDateRange(startDate, endDate);

    const offerId = await ctx.db.insert("offers", {
      companyId: args.companyId,
      contentEn,
      ...(contentAr ? { contentAr } : {}),
      active: args.active,
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
    });

    const offer = await ctx.db.get(offerId);
    if (!offer) {
      throw new Error("Created offer could not be loaded");
    }

    return mapOffer(offer, now);
  },
});

export const update = internalMutation({
  args: {
    companyId: v.id("companies"),
    offerId: v.id("offers"),
    contentEn: v.optional(v.string()),
    contentAr: v.optional(v.union(v.string(), v.null())),
    active: v.optional(v.boolean()),
    startDate: v.optional(v.union(v.number(), v.null())),
    endDate: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args): Promise<OfferDto | null> => {
    const existingOffer = await getScopedOffer(ctx, args.companyId, args.offerId);
    if (!existingOffer) {
      return null;
    }

    const nextStartDate =
      args.startDate !== undefined
        ? normalizeOptionalTimestamp(args.startDate, "startDate")
        : existingOffer.startDate;
    const nextEndDate =
      args.endDate !== undefined
        ? normalizeOptionalTimestamp(args.endDate, "endDate")
        : existingOffer.endDate;
    validateDateRange(nextStartDate, nextEndDate);

    const patch: {
      contentEn?: string;
      contentAr?: string | undefined;
      active?: boolean;
      startDate?: number | undefined;
      endDate?: number | undefined;
    } = {};

    if (args.contentEn !== undefined) {
      patch.contentEn = normalizeRequiredString(args.contentEn, "contentEn");
    }

    if (args.contentAr !== undefined) {
      patch.contentAr = normalizeOptionalString(args.contentAr);
    }

    if (args.active !== undefined) {
      patch.active = args.active;
    }

    if (args.startDate !== undefined) {
      patch.startDate = nextStartDate;
    }

    if (args.endDate !== undefined) {
      patch.endDate = nextEndDate;
    }

    await ctx.db.patch(args.offerId, patch);

    const updatedOffer = await ctx.db.get(args.offerId);
    if (!updatedOffer) {
      throw new Error("Updated offer could not be loaded");
    }

    return mapOffer(updatedOffer, Date.now());
  },
});

export const remove = internalMutation({
  args: {
    companyId: v.id("companies"),
    offerId: v.id("offers"),
  },
  handler: async (ctx, args): Promise<DeleteOfferResult | null> => {
    const offer = await getScopedOffer(ctx, args.companyId, args.offerId);
    if (!offer) {
      return null;
    }

    await ctx.db.delete(args.offerId);

    return {
      offerId: args.offerId,
    };
  },
});
