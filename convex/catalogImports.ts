import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalAction, internalMutation, type MutationCtx } from './_generated/server';
import { refreshCompanyCatalogLanguageHintsInMutation } from './catalogLanguageHints';
import { normalizeNameKey, VALIDATION_PREFIX } from './categoriesShared';
import { buildProductEmbeddingPayload } from './productEmbeddingRuntime';

const NOT_FOUND_PREFIX = 'NOT_FOUND';
const UNIT_DELETE_BATCH_SIZE = 50;

const bilingualTextValidator = {
  en: v.string(),
  ar: v.string(),
} as const;

const unitValidator = v.object({
  labelEn: v.string(),
  labelAr: v.string(),
  price: v.number(),
  sortOrder: v.optional(v.number()),
});

const groupValidator = v.object({
  productNo: v.string(),
  category: v.object(bilingualTextValidator),
  productName: v.object(bilingualTextValidator),
  description: v.optional(v.object(bilingualTextValidator)),
  currency: v.string(),
  units: v.array(unitValidator),
});

type ImportGroup = {
  productNo: string;
  category: { en: string; ar: string };
  productName: { en: string; ar: string };
  description?: { en: string; ar: string };
  currency: string;
  units: Array<{ labelEn: string; labelAr: string; price: number; sortOrder?: number }>;
};

const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

const assertNonNegativeUnitPrices = (group: ImportGroup): void => {
  if (group.units.some((unit) => unit.price < 0)) {
    throw createTaggedError(
      VALIDATION_PREFIX,
      `Unit price must be a non-negative number for product ${group.productNo}`,
    );
  }
};

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
  handler: async (ctx, args): Promise<{ productId: string; unitCount: number; categoryCreated: boolean }> => {
    assertNonNegativeUnitPrices(args.group);

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
      const existingUnits = await ctx.db
        .query('productUnits')
        .withIndex('by_product', (q) => q.eq('productId', existingProduct._id))
        .collect();
      const existingUnitIds = existingUnits.map((unit) => unit._id);
      for (let index = 0; index < existingUnitIds.length; index += UNIT_DELETE_BATCH_SIZE) {
        const batch = existingUnitIds.slice(index, index + UNIT_DELETE_BATCH_SIZE);
        await Promise.all(batch.map((unitId) => ctx.db.delete(unitId)));
      }

      await ctx.db.patch(existingProduct._id, {
        categoryId,
        productNo: args.group.productNo,
        nameEn: args.group.productName.en,
        nameAr: args.group.productName.ar,
        descriptionEn: args.group.description?.en,
        descriptionAr: args.group.description?.ar,
        price: undefined,
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
      currency: args.group.currency,
      version: 1,
    });

    for (const unit of args.group.units) {
      await ctx.db.insert('productUnits', {
        companyId: args.companyId,
        productId,
        labelEn: unit.labelEn,
        labelAr: unit.labelAr,
        price: unit.price,
        ...(unit.sortOrder !== undefined ? { sortOrder: unit.sortOrder } : {}),
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
    return { productId, unitCount: args.group.units.length, categoryCreated: category.created };
  },
});

export const apply = internalAction({
  args: {
    companyId: v.id('companies'),
    groups: v.array(groupValidator),
  },
  handler: async (ctx, args): Promise<{
    replacedProductGroupCount: number;
    replacedUnitCount: number;
    createdOrUpdatedCategoryCount: number;
  }> => {
    let replacedUnitCount = 0;
    let createdOrUpdatedCategoryCount = 0;

    for (const group of args.groups as ImportGroup[]) {
      assertNonNegativeUnitPrices(group);

      const embeddings = await buildProductEmbeddingPayload({
        companyId: args.companyId,
        categoryId: 'placeholder' as Id<'categories'>,
        productNo: group.productNo,
        nameEn: group.productName.en,
        nameAr: group.productName.ar,
        ...(group.description ? { descriptionEn: group.description.en, descriptionAr: group.description.ar } : {}),
        currency: group.currency,
      }, group.units.map((unit, index) => ({
        id: `import-unit-${index}`,
        productId: 'placeholder' as Id<'products'>,
        labelEn: unit.labelEn,
        labelAr: unit.labelAr,
        price: unit.price,
      })));

      const result = await ctx.runMutation(internal.catalogImports.applyTranslatedGroup, {
        companyId: args.companyId,
        group,
        ...embeddings,
      });
      replacedUnitCount += result.unitCount;
      createdOrUpdatedCategoryCount += result.categoryCreated ? 1 : 0;
    }

    return {
      replacedProductGroupCount: args.groups.length,
      replacedUnitCount,
      createdOrUpdatedCategoryCount,
    };
  },
});
