import { v } from 'convex/values';
import type { CatalogLanguageHints } from '@cs/shared';
import { deriveCatalogLanguageHints } from '@cs/shared';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

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
  const products = await ctx.db
    .query("products")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();

  return deriveCatalogLanguageHints(products.map(toCatalogLanguageSample));
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
