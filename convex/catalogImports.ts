import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalAction, internalMutation, type MutationCtx } from './_generated/server';
import { refreshCompanyCatalogLanguageHintsInMutation } from './catalogLanguageHints';
import { normalizeNameKey } from './categoriesShared';
import { buildProductEmbeddingPayload } from './productEmbeddingRuntime';

const NOT_FOUND_PREFIX = 'NOT_FOUND';
const VALIDATION_PREFIX = 'VALIDATION_FAILED';
const VARIANT_DELETE_BATCH_SIZE = 50;

const bilingualTextValidator = {
  en: v.string(),
  ar: v.string(),
} as const;

const variantValidator = v.object({
  labelEn: v.string(),
  labelAr: v.string(),
  price: v.optional(v.number()),
});

const groupValidator = v.object({
  productNo: v.string(),
  category: v.object(bilingualTextValidator),
  productName: v.object(bilingualTextValidator),
  description: v.optional(v.object(bilingualTextValidator)),
  price: v.optional(v.number()),
  currency: v.optional(v.string()),
  variants: v.array(variantValidator),
});

type ImportGroup = {
  productNo: string;
  category: { en: string; ar: string };
  productName: { en: string; ar: string };
  description?: { en: string; ar: string };
  price?: number;
  currency?: string;
  variants: Array<{ labelEn: string; labelAr: string; price?: number }>;
};

const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

const getProductByProductNo = async (
  ctx: MutationCtx,
  companyId: Id<'companies'>,
  productNo: string,
) => {
  const products = await ctx.db
    .query('products')
    .withIndex('by_company', (q) => q.eq('companyId', companyId))
    .collect();

  return products.find((product) => product.productNo === productNo) ?? null;
};

const resolveCategory = async (
  ctx: MutationCtx,
  companyId: Id<'companies'>,
  category: { en: string; ar: string },
): Promise<{ categoryId: Id<'categories'>; created: boolean }> => {
  const nameKey = normalizeNameKey(category.en, category.ar);
  const existing = await ctx.db
    .query('categories')
    .withIndex('by_company_name_key', (q) => q.eq('companyId', companyId).eq('nameKey', nameKey))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      nameEn: category.en,
      nameAr: category.ar,
      nameKey,
    });
    return { categoryId: existing._id, created: false };
  }

  return {
    categoryId: await ctx.db.insert('categories', {
    companyId,
    nameEn: category.en,
    nameAr: category.ar,
    nameKey,
    }),
    created: true,
  };
};

export const applyTranslatedGroup = internalMutation({
  args: {
    companyId: v.id('companies'),
    group: groupValidator,
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (ctx, args): Promise<{ productId: string; variantCount: number; categoryCreated: boolean }> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Company not found');
    }

    // TODO: upload and retain raw import workbooks in S3 before parsing once catalog import leaves test scope.
    // TODO: attach spreadsheet image columns to product media after the image import contract is defined.
    const category = await resolveCategory(ctx, args.companyId, args.group.category);
    const categoryId = category.categoryId;
    const existingProduct = await getProductByProductNo(ctx, args.companyId, args.group.productNo);

    if (existingProduct) {
      const existingVariants = await ctx.db
        .query('productVariants')
        .withIndex('by_product', (q) => q.eq('productId', existingProduct._id))
        .collect();
      const existingVariantIds = existingVariants.map((variant) => variant._id);
      for (let index = 0; index < existingVariantIds.length; index += VARIANT_DELETE_BATCH_SIZE) {
        const batch = existingVariantIds.slice(index, index + VARIANT_DELETE_BATCH_SIZE);
        await Promise.all(batch.map((variantId) => ctx.db.delete(variantId)));
      }

      await ctx.db.patch(existingProduct._id, {
        categoryId,
        productNo: args.group.productNo,
        nameEn: args.group.productName.en,
        nameAr: args.group.productName.ar,
        descriptionEn: args.group.description?.en,
        descriptionAr: args.group.description?.ar,
        price: args.group.price,
        currency: args.group.currency,
        version: (existingProduct.version ?? 0) + 1,
      });
    }

    const productId = existingProduct?._id ?? await ctx.db.insert('products', {
      companyId: args.companyId,
      categoryId,
      productNo: args.group.productNo,
      nameEn: args.group.productName.en,
      nameAr: args.group.productName.ar,
      ...(args.group.description ? {
        descriptionEn: args.group.description.en,
        descriptionAr: args.group.description.ar,
      } : {}),
      ...(args.group.price !== undefined ? { price: args.group.price } : {}),
      ...(args.group.currency ? { currency: args.group.currency } : {}),
      version: 1,
    });

    for (const variant of args.group.variants) {
      await ctx.db.insert('productVariants', {
        companyId: args.companyId,
        productId,
        labelEn: variant.labelEn,
        labelAr: variant.labelAr,
        ...(variant.price !== undefined ? { price: variant.price } : {}),
      });
    }

    const embeddings = await ctx.db
      .query('embeddings')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect();
    await Promise.all(embeddings.map((embedding) => ctx.db.delete(embedding._id)));

    await ctx.db.insert('embeddings', {
      companyId: args.companyId,
      productId,
      embedding: args.englishEmbedding,
      textContent: args.englishText,
      language: 'en',
      companyLanguage: `${args.companyId}:en`,
    });
    await ctx.db.insert('embeddings', {
      companyId: args.companyId,
      productId,
      embedding: args.arabicEmbedding,
      textContent: args.arabicText,
      language: 'ar',
      companyLanguage: `${args.companyId}:ar`,
    });

    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);
    return { productId, variantCount: args.group.variants.length, categoryCreated: category.created };
  },
});

export const apply = internalAction({
  args: {
    companyId: v.id('companies'),
    groups: v.array(groupValidator),
  },
  handler: async (ctx, args): Promise<{
    replacedProductGroupCount: number;
    replacedVariantCount: number;
    createdOrUpdatedCategoryCount: number;
  }> => {
    let replacedVariantCount = 0;
    let createdOrUpdatedCategoryCount = 0;

    for (const group of args.groups as ImportGroup[]) {
      if (group.price !== undefined && !group.currency) {
        throw createTaggedError(VALIDATION_PREFIX, 'currency is required when a price is set');
      }

      const embeddings = await buildProductEmbeddingPayload({
        companyId: args.companyId,
        categoryId: 'placeholder' as Id<'categories'>,
        productNo: group.productNo,
        nameEn: group.productName.en,
        nameAr: group.productName.ar,
        ...(group.description ? { descriptionEn: group.description.en, descriptionAr: group.description.ar } : {}),
        ...(group.price !== undefined ? { price: group.price } : {}),
        ...(group.currency ? { currency: group.currency } : {}),
      }, group.variants.map((variant, index) => ({
        id: `import-variant-${index}`,
        productId: 'placeholder' as Id<'products'>,
        labelEn: variant.labelEn,
        labelAr: variant.labelAr,
        ...(variant.price !== undefined ? { price: variant.price } : {}),
      })));

      const result = await ctx.runMutation(internal.catalogImports.applyTranslatedGroup, {
        companyId: args.companyId,
        group,
        ...embeddings,
      });
      replacedVariantCount += result.variantCount;
      createdOrUpdatedCategoryCount += result.categoryCreated ? 1 : 0;
    }

    return {
      replacedProductGroupCount: args.groups.length,
      replacedVariantCount,
      createdOrUpdatedCategoryCount,
    };
  },
});
