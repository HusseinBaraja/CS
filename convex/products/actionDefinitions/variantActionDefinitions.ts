import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { ActionCtx } from '../../_generated/server';
import { internal } from '../../_generated/api';
import { buildProductEmbeddingPayload } from '../../productEmbeddingRuntime';
import { NOT_FOUND_PREFIX, createTaggedError } from '../errors';
import { sortVariants, toVariantWriteState } from '../mapping';
import {
  mergeVariantUpdateState,
  normalizeVariantCreateState,
} from '../normalization';
import {
  type DeleteProductVariantResult,
  type ProductVariantAttributes,
  type ProductVariantDto,
  variantAttributesValidator,
} from '../types';

export const createVariantDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    variantLabel: v.string(),
    attributes: variantAttributesValidator,
    priceOverride: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      variantLabel: string;
      attributes: ProductVariantAttributes;
      priceOverride?: number;
    },
  ): Promise<ProductVariantDto | null> => {
    const snapshot = await ctx.runQuery(internal.products.getVariantCreateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
    });

    if (!snapshot) {
      return null;
    }

    const nextVariant = normalizeVariantCreateState({
      productId: args.productId,
      variantLabel: args.variantLabel,
      attributes: args.attributes,
      priceOverride: args.priceOverride,
    });
    const embeddings = await buildProductEmbeddingPayload(snapshot, sortVariants([
      ...snapshot.variants.map(toVariantWriteState),
      nextVariant,
    ]));

    return ctx.runMutation(internal.products.insertVariantWithEmbeddings, {
      ...args,
      expectedRevision: snapshot.expectedRevision,
      ...embeddings,
    });
  },
};

export const updateVariantDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    variantId: v.id('productVariants'),
    variantLabel: v.optional(v.string()),
    attributes: v.optional(variantAttributesValidator),
    priceOverride: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      variantId: Id<'productVariants'>;
      variantLabel?: string;
      attributes?: ProductVariantAttributes;
      priceOverride?: number | null;
    },
  ): Promise<ProductVariantDto | null> => {
    const snapshot = await ctx.runQuery(internal.products.getVariantUpdateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
      variantId: args.variantId,
    });

    if (!snapshot) {
      return null;
    }

    if (!snapshot.targetVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    const nextVariant = mergeVariantUpdateState(toVariantWriteState(snapshot.targetVariant), args);
    const embeddings = await buildProductEmbeddingPayload(
      snapshot,
      sortVariants(
        snapshot.variants.map((variant: ProductVariantDto) =>
          variant.id === args.variantId ? nextVariant : toVariantWriteState(variant)
        ),
      ),
    );

    return ctx.runMutation(internal.products.patchVariantWithEmbeddings, {
      ...args,
      expectedRevision: snapshot.expectedRevision,
      ...embeddings,
    });
  },
};

export const removeVariantDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    variantId: v.id('productVariants'),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      variantId: Id<'productVariants'>;
    },
  ): Promise<DeleteProductVariantResult | null> => {
    const snapshot = await ctx.runQuery(internal.products.getVariantUpdateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
      variantId: args.variantId,
    });

    if (!snapshot) {
      return null;
    }

    if (!snapshot.targetVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    const embeddings = await buildProductEmbeddingPayload(
      snapshot,
      snapshot.variants
        .filter((variant: ProductVariantDto) => variant.id !== args.variantId)
        .map(toVariantWriteState),
    );

    return ctx.runMutation(internal.products.removeVariantWithEmbeddings, {
      ...args,
      expectedRevision: snapshot.expectedRevision,
      ...embeddings,
    });
  },
};
