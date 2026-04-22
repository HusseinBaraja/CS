import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';
import { refreshCompanyCatalogLanguageHintsInMutation } from '../../catalogLanguageHints';
import { enqueueCleanupJobInMutation } from '../../mediaCleanup';
import { replaceProductEmbeddingsInMutation } from '../../productEmbeddingRuntime';
import { getEmbeddingReplacementArgs } from '../embedding';
import { CONFLICT_PREFIX, NOT_FOUND_PREFIX, createTaggedError } from '../errors';
import { mapProductDetail } from '../mapping';
import { createProductPatch, normalizeCreateState } from '../normalization';
import {
  getCompany,
  getProductVariants,
  getScopedCategory,
  getScopedProduct,
} from '../readers';
import {
  flexRecord,
  type DeleteProductResult,
  type ProductDetailDto,
} from '../types';

export const insertProductWithEmbeddingsDefinition = {
  args: {
    companyId: v.id('companies'),
    categoryId: v.id('categories'),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    specifications: v.optional(flexRecord),
    basePrice: v.optional(v.number()),
    baseCurrency: v.optional(v.string()),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      categoryId: Id<'categories'>;
      nameEn: string;
      nameAr?: string;
      descriptionEn?: string;
      descriptionAr?: string;
      specifications?: Record<string, string | number | boolean>;
      basePrice?: number;
      baseCurrency?: string;
      englishEmbedding: number[];
      arabicEmbedding: number[];
      englishText: string;
      arabicText: string;
    },
  ): Promise<ProductDetailDto> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Company not found');
    }

    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
    if (!category) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Category not found');
    }

    const productState = normalizeCreateState(args);
    const productId = await ctx.db.insert('products', {
      companyId: args.companyId,
      categoryId: productState.categoryId,
      revision: 1,
      nameEn: productState.nameEn,
      ...(productState.nameAr ? { nameAr: productState.nameAr } : {}),
      ...(productState.descriptionEn ? { descriptionEn: productState.descriptionEn } : {}),
      ...(productState.descriptionAr ? { descriptionAr: productState.descriptionAr } : {}),
      ...(productState.specifications ? { specifications: productState.specifications } : {}),
      ...(productState.basePrice !== undefined ? { basePrice: productState.basePrice } : {}),
      ...(productState.baseCurrency ? { baseCurrency: productState.baseCurrency } : {}),
      images: [],
    });

    await replaceProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

    const product = await ctx.db.get(productId);
    if (!product) {
      throw new Error('Created product could not be loaded');
    }

    return mapProductDetail(product, []);
  },
};

export const patchProductWithEmbeddingsDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    categoryId: v.optional(v.id('categories')),
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.union(v.string(), v.null())),
    descriptionEn: v.optional(v.union(v.string(), v.null())),
    descriptionAr: v.optional(v.union(v.string(), v.null())),
    specifications: v.optional(v.union(flexRecord, v.null())),
    basePrice: v.optional(v.union(v.number(), v.null())),
    baseCurrency: v.optional(v.union(v.string(), v.null())),
    expectedRevision: v.number(),
    englishEmbedding: v.optional(v.array(v.float64())),
    arabicEmbedding: v.optional(v.array(v.float64())),
    englishText: v.optional(v.string()),
    arabicText: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      categoryId?: Id<'categories'>;
      nameEn?: string;
      nameAr?: string | null;
      descriptionEn?: string | null;
      descriptionAr?: string | null;
      specifications?: Record<string, string | number | boolean> | null;
      basePrice?: number | null;
      baseCurrency?: string | null;
      expectedRevision: number;
      englishEmbedding?: number[];
      arabicEmbedding?: number[];
      englishText?: string;
      arabicText?: string;
    },
  ): Promise<ProductDetailDto | null> => {
    const existingProduct = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!existingProduct) {
      return null;
    }

    if ((existingProduct.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, 'Product was modified concurrently; retry the update');
    }

    if (args.categoryId !== undefined) {
      const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
      if (!category) {
        throw createTaggedError(NOT_FOUND_PREFIX, 'Category not found');
      }
    }

    const patch = createProductPatch(args);
    await ctx.db.patch(args.productId, {
      ...patch,
      revision: args.expectedRevision + 1,
    });

    const embeddingReplacementArgs = getEmbeddingReplacementArgs(args);
    if (embeddingReplacementArgs) {
      await replaceProductEmbeddingsInMutation(ctx, embeddingReplacementArgs);
      await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);
    }

    const updatedProduct = await ctx.db.get(args.productId);
    if (!updatedProduct) {
      throw new Error('Updated product could not be loaded');
    }

    const variants = await getProductVariants(ctx, args.productId);
    return mapProductDetail(updatedProduct, variants);
  },
};

export const removeDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
  },
  handler: async (
    ctx: MutationCtx,
    args: { companyId: Id<'companies'>; productId: Id<'products'> },
  ): Promise<DeleteProductResult | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const variants = await ctx.db
      .query('productVariants')
      .withIndex('by_product', (q) => q.eq('productId', args.productId))
      .collect();
    for (const variant of variants) {
      await ctx.db.delete(variant._id);
    }

    const embeddings = await ctx.db
      .query('embeddings')
      .withIndex('by_product', (q) => q.eq('productId', args.productId))
      .collect();
    for (const embedding of embeddings) {
      await ctx.db.delete(embedding._id);
    }

    for (const image of product.images ?? []) {
      await enqueueCleanupJobInMutation(ctx, {
        companyId: args.companyId,
        productId: args.productId,
        imageId: image.id,
        objectKey: image.key,
        reason: 'product_deleted',
      });
    }

    await ctx.db.delete(args.productId);
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

    return {
      productId: args.productId,
    };
  },
};
