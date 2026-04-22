import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { QueryCtx } from '../../_generated/server';
import { toWriteState } from '../mapping';
import {
  getCompany,
  getScopedCategory,
  getScopedProduct,
  getVariantCreateSnapshotData,
} from '../readers';
import type {
  ProductVariantCreateSnapshot,
  ProductVariantUpdateSnapshot,
  ProductWriteSnapshot,
} from '../types';

export const getCreateContextDefinition = {
  args: {
    companyId: v.id('companies'),
    categoryId: v.id('categories'),
  },
  handler: async (
    ctx: QueryCtx,
    args: { companyId: Id<'companies'>; categoryId: Id<'categories'> },
  ): Promise<{ companyExists: boolean; categoryExists: boolean }> => {
    const company = await getCompany(ctx, args.companyId);
    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);

    return {
      companyExists: Boolean(company),
      categoryExists: Boolean(category),
    };
  },
};

export const getUpdateSnapshotDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
    },
  ): Promise<ProductWriteSnapshot | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    return {
      productId: product._id,
      expectedRevision: product.revision ?? 0,
      ...toWriteState(product),
    };
  },
};

export const getVariantCreateSnapshotDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
    },
  ): Promise<ProductVariantCreateSnapshot | null> =>
    getVariantCreateSnapshotData(ctx, args.companyId, args.productId),
};

export const getVariantUpdateSnapshotDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    variantId: v.id('productVariants'),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      variantId: Id<'productVariants'>;
    },
  ): Promise<ProductVariantUpdateSnapshot | null> => {
    const productSnapshot = await getVariantCreateSnapshotData(ctx, args.companyId, args.productId);
    if (!productSnapshot) {
      return null;
    }

    return {
      ...productSnapshot,
      targetVariant: productSnapshot.variants.find((variant) => variant.id === args.variantId) ?? null,
    };
  },
};

export const categoryExistsForCompanyDefinition = {
  args: {
    companyId: v.id('companies'),
    categoryId: v.id('categories'),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      companyId: Id<'companies'>;
      categoryId: Id<'categories'>;
    },
  ): Promise<boolean> => {
    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
    return Boolean(category);
  },
};
