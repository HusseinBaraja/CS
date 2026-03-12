import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';

type CurrencyRateDto = {
  companyId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
};

type UpsertCurrencyRateResult = {
  created: boolean;
  currencyRate: CurrencyRateDto;
};

type CurrencyRateReader = {
  db: Pick<MutationCtx["db"], "get" | "query">;
};

const VALIDATION_PREFIX = "VALIDATION_FAILED";
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u;

const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

const normalizeCurrencyCode = (value: string, fieldName: string): string => {
  const normalized = value.trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(normalized)) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} must be a 3-letter alphabetic code`);
  }

  return normalized;
};

const normalizeRate = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw createTaggedError(VALIDATION_PREFIX, "rate must be a finite positive number");
  }

  return value;
};

const mapCurrencyRate = (currencyRate: Doc<"currencyRates">): CurrencyRateDto => ({
  companyId: currencyRate.companyId,
  fromCurrency: currencyRate.fromCurrency,
  toCurrency: currencyRate.toCurrency,
  rate: currencyRate.rate,
});

const getCompany = async (
  ctx: CurrencyRateReader,
  companyId: Id<"companies">,
) => ctx.db.get(companyId);

const sortCurrencyRates = <T extends { fromCurrency: string; toCurrency: string }>(rates: T[]): T[] =>
  rates.sort(
    (left, right) =>
      left.fromCurrency.localeCompare(right.fromCurrency) ||
      left.toCurrency.localeCompare(right.toCurrency),
  );

const sortCanonicalDuplicates = <T extends { _creationTime: number; _id: string }>(rates: T[]): T[] =>
  rates.sort(
    (left, right) =>
      left._creationTime - right._creationTime || left._id.localeCompare(right._id),
  );

export const list = internalQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<CurrencyRateDto[] | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const currencyRates = await ctx.db
      .query("currencyRates")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    return sortCurrencyRates(currencyRates.map(mapCurrencyRate));
  },
});

export const upsert = internalMutation({
  args: {
    companyId: v.id("companies"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
  },
  handler: async (ctx, args): Promise<UpsertCurrencyRateResult | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const fromCurrency = normalizeCurrencyCode(args.fromCurrency, "fromCurrency");
    const toCurrency = normalizeCurrencyCode(args.toCurrency, "toCurrency");
    if (fromCurrency === toCurrency) {
      throw createTaggedError(
        VALIDATION_PREFIX,
        "fromCurrency and toCurrency must be different",
      );
    }

    const rate = normalizeRate(args.rate);
    const matches = await ctx.db
      .query("currencyRates")
      .withIndex("by_company_pair", (q) =>
        q.eq("companyId", args.companyId).eq("fromCurrency", fromCurrency).eq("toCurrency", toCurrency),
      )
      .collect();

    if (matches.length === 0) {
      const currencyRateId = await ctx.db.insert("currencyRates", {
        companyId: args.companyId,
        fromCurrency,
        toCurrency,
        rate,
      });
      const currencyRate = await ctx.db.get(currencyRateId);
      if (!currencyRate) {
        throw new Error("Created currency rate could not be loaded");
      }

      return {
        created: true,
        currencyRate: mapCurrencyRate(currencyRate),
      };
    }

    const [canonical, ...duplicates] = sortCanonicalDuplicates(matches);
    await ctx.db.patch(canonical._id, {
      fromCurrency,
      toCurrency,
      rate,
    });

    for (const duplicate of duplicates) {
      await ctx.db.delete(duplicate._id);
    }

    const updatedCurrencyRate = await ctx.db.get(canonical._id);
    if (!updatedCurrencyRate) {
      throw new Error("Updated currency rate could not be loaded");
    }

    return {
      created: false,
      currencyRate: mapCurrencyRate(updatedCurrencyRate),
    };
  },
});
