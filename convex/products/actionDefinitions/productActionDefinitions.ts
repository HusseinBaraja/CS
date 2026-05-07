import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { ActionCtx } from '../../_generated/server';
import { internal } from '../../_generated/api';
import { buildProductEmbeddingPayload } from '../../productEmbeddingRuntime';
import { NOT_FOUND_PREFIX, createTaggedError } from '../errors';
import { hasEmbeddingRelevantChanges, toVariantWriteState } from '../mapping';
import { mergeUpdateState, normalizeCreateState } from '../normalization';
import type {
  ProductDetailDto,
} from '../types';

export const createDefinition = {
  args: {
    companyId: v.id('companies'),
    categoryId: v.id('categories'),
    productNo: v.optional(v.string()),
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    primaryImage: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      companyId: Id<'companies'>;
      categoryId: Id<'categories'>;
      productNo?: string;
      nameEn?: string;
      nameAr?: string;
      descriptionEn?: string;
      descriptionAr?: string;
      price?: number;
      currency?: string;
      primaryImage?: string;
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
    productNo: v.optional(v.union(v.string(), v.null())),
    nameEn: v.optional(v.union(v.string(), v.null())),
    nameAr: v.optional(v.union(v.string(), v.null())),
    descriptionEn: v.optional(v.union(v.string(), v.null())),
    descriptionAr: v.optional(v.union(v.string(), v.null())),
    price: v.optional(v.union(v.number(), v.null())),
    currency: v.optional(v.union(v.string(), v.null())),
    primaryImage: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      categoryId?: Id<'categories'>;
      productNo?: string | null;
      nameEn?: string | null;
      nameAr?: string | null;
      descriptionEn?: string | null;
      descriptionAr?: string | null;
      price?: number | null;
      currency?: string | null;
      primaryImage?: string | null;
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

    const payload = {
      ...args,
      expectedRevision: existingProduct.revision,
      ...(embeddings ? embeddings : {}),
    };

    return ctx.runMutation(internal.products.patchProductWithEmbeddings, payload);
  },
};
