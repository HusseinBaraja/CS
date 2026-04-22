import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { ActionCtx } from '../../_generated/server';
import { internal } from '../../_generated/api';
import { buildProductEmbeddingPayload } from '../../productEmbeddingRuntime';
import { NOT_FOUND_PREFIX, createTaggedError } from '../errors';
import { hasEmbeddingRelevantChanges, toVariantWriteState } from '../mapping';
import { mergeUpdateState, normalizeCreateState } from '../normalization';
import {
  flexRecord,
  type ProductDetailDto,
} from '../types';

export const createDefinition = {
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
  },
  handler: async (
    ctx: ActionCtx,
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
    },
  ): Promise<ProductDetailDto> => {
    const createContext = await ctx.runQuery(internal.products.getCreateContext, {
      companyId: args.companyId,
      categoryId: args.categoryId,
    });

    if (!createContext.companyExists) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Company not found');
    }

    if (!createContext.categoryExists) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Category not found');
    }

    const productState = normalizeCreateState(args);
    const embeddings = await buildProductEmbeddingPayload(productState);

    return ctx.runMutation(internal.products.insertProductWithEmbeddings, {
      ...args,
      ...embeddings,
    });
  },
};

export const updateDefinition = {
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
  },
  handler: async (
    ctx: ActionCtx,
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
    },
  ): Promise<ProductDetailDto | null> => {
    const existingProduct = await ctx.runQuery(internal.products.getUpdateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
    });

    if (!existingProduct) {
      return null;
    }

    if (args.categoryId !== undefined) {
      const categoryExists = await ctx.runQuery(internal.products.categoryExistsForCompany, {
        companyId: args.companyId,
        categoryId: args.categoryId,
      });

      if (!categoryExists) {
        throw createTaggedError(NOT_FOUND_PREFIX, 'Category not found');
      }
    }

    const nextState = mergeUpdateState(existingProduct, args);
    const shouldRefreshEmbeddings = hasEmbeddingRelevantChanges(existingProduct, nextState);
    const variants = shouldRefreshEmbeddings
      ? await ctx.runQuery(internal.products.listVariants, {
          companyId: args.companyId,
          productId: args.productId,
        })
      : null;
    const embeddings = shouldRefreshEmbeddings
      ? await buildProductEmbeddingPayload(nextState, (variants ?? []).map(toVariantWriteState))
      : null;

    if (!embeddings) {
      return ctx.runMutation(internal.products.patchProductWithEmbeddings, {
        ...args,
        expectedRevision: existingProduct.expectedRevision,
      });
    }

    return ctx.runMutation(internal.products.patchProductWithEmbeddings, {
      ...args,
      expectedRevision: existingProduct.expectedRevision,
      ...embeddings,
    });
  },
};
