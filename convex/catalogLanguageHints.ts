import { v } from 'convex/values';
import type { CatalogLanguageHints } from '@cs/shared';
import {
  buildCatalogLanguageHintsFromCharacterCounts,
  countCatalogLanguageCharacters,
} from '@cs/shared';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

const CATALOG_LANGUAGE_HINTS_PAGE_SIZE = 128;

export const catalogLanguageHintsValidator = v.object({
  primaryCatalogLanguage: v.union(
    v.literal("ar"),
    v.literal("en"),
    v.literal("mixed"),
    v.literal("unknown"),
  ),
  supportedLanguages: v.array(v.union(v.literal("ar"), v.literal("en"))),
  preferredTermPreservation: v.union(
    v.literal("user_language"),
    v.literal("catalog_language"),
    v.literal("mixed"),
  ),
});

const toCatalogLanguageSample = (
  product: Doc<"products">,
): {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
} => ({
  ...(product.nameEn ? { nameEn: product.nameEn } : {}),
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
});

const deriveCompanyCatalogLanguageHints = async (
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  companyId: Id<"companies">,
): Promise<CatalogLanguageHints> => {
  let cursor: string | null = null;
  let arabicCharCount = 0;
  let englishCharCount = 0;

  while (true) {
    const page = await ctx.db
      .query("products")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .paginate({
        cursor,
        numItems: CATALOG_LANGUAGE_HINTS_PAGE_SIZE,
      });
    const counts = countCatalogLanguageCharacters(page.page.map(toCatalogLanguageSample));
    arabicCharCount += counts.arabicCharCount;
    englishCharCount += counts.englishCharCount;

    if (page.isDone || page.page.length === 0 || page.continueCursor === cursor) {
      break;
    }

    cursor = page.continueCursor;
  }

  return buildCatalogLanguageHintsFromCharacterCounts({
    arabicCharCount,
    englishCharCount,
  });
};

export const getCompanyCatalogLanguageHints = async (
  ctx: QueryCtx,
  companyId: Id<"companies">,
): Promise<CatalogLanguageHints | null> => {
  const company = await ctx.db.get(companyId);
  if (!company) {
    return null;
  }

  return company.catalogLanguageHints ?? null;
};

export const refreshCompanyCatalogLanguageHintsInMutation = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
): Promise<CatalogLanguageHints | null> => {
  const company = await ctx.db.get(companyId);
  if (!company) {
    return null;
  }

  const catalogLanguageHints = await deriveCompanyCatalogLanguageHints(ctx, companyId);
  await ctx.db.patch(companyId, {
    catalogLanguageHints,
  });

  return catalogLanguageHints;
};
