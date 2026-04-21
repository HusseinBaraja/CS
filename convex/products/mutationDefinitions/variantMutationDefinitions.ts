import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';
import { replaceProductEmbeddingsInMutation } from '../../productEmbeddingRuntime';
import { CONFLICT_PREFIX, NOT_FOUND_PREFIX, createTaggedError } from '../errors';
import { mapVariant } from '../mapping';
import { createVariantPatch, normalizeVariantCreateState } from '../normalization';
import { getScopedProduct, getScopedVariant } from '../readers';
import {
  type DeleteProductVariantResult,
  type ProductVariantAttributes,
  type ProductVariantDto,
  variantAttributesValidator,
} from '../types';

export const insertVariantWithEmbeddingsDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    variantLabel: v.string(),
    attributes: variantAttributesValidator,
    priceOverride: v.optional(v.number()),
    expectedRevision: v.number(),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      variantLabel: string;
      attributes: ProductVariantAttributes;
      priceOverride?: number;
      expectedRevision: number;
      englishEmbedding: number[];
      arabicEmbedding: number[];
      englishText: string;
      arabicText: string;
    },
  ): Promise<ProductVariantDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    if ((product.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, 'Product was modified concurrently; retry the update');
    }

    const variantState = normalizeVariantCreateState({
      productId: args.productId,
      variantLabel: args.variantLabel,
      attributes: args.attributes,
      priceOverride: args.priceOverride,
    });
    const variantId = await ctx.db.insert('productVariants', {
      productId: args.productId,
      variantLabel: variantState.variantLabel,
      attributes: variantState.attributes,
      ...(variantState.priceOverride !== undefined ? { priceOverride: variantState.priceOverride } : {}),
    });

    await ctx.db.patch(args.productId, {
      revision: args.expectedRevision + 1,
    });

    await replaceProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });

    const variant = await ctx.db.get(variantId);
    if (!variant) {
      throw new Error('Created variant could not be loaded');
    }

    return mapVariant(variant);
  },
};

export const patchVariantWithEmbeddingsDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    variantId: v.id('productVariants'),
    variantLabel: v.optional(v.string()),
    attributes: v.optional(variantAttributesValidator),
    priceOverride: v.optional(v.union(v.number(), v.null())),
    expectedRevision: v.number(),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      variantId: Id<'productVariants'>;
      variantLabel?: string;
      attributes?: ProductVariantAttributes;
      priceOverride?: number | null;
      expectedRevision: number;
      englishEmbedding: number[];
      arabicEmbedding: number[];
      englishText: string;
      arabicText: string;
    },
  ): Promise<ProductVariantDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    if ((product.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, 'Product was modified concurrently; retry the update');
    }

    const existingVariant = await getScopedVariant(ctx, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    const patch = createVariantPatch({
      variantLabel: args.variantLabel,
      attributes: args.attributes,
      priceOverride: args.priceOverride,
    });
    await ctx.db.patch(args.variantId, patch);
    await ctx.db.patch(args.productId, {
      revision: args.expectedRevision + 1,
    });

    await replaceProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });

    const updatedVariant = await ctx.db.get(args.variantId);
    if (!updatedVariant) {
      throw new Error('Updated variant could not be loaded');
    }

    return mapVariant(updatedVariant);
  },
};

export const removeVariantWithEmbeddingsDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    variantId: v.id('productVariants'),
    expectedRevision: v.number(),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      variantId: Id<'productVariants'>;
      expectedRevision: number;
      englishEmbedding: number[];
      arabicEmbedding: number[];
      englishText: string;
      arabicText: string;
    },
  ): Promise<DeleteProductVariantResult | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    if ((product.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, 'Product was modified concurrently; retry the update');
    }

    const existingVariant = await getScopedVariant(ctx, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    await ctx.db.delete(args.variantId);
    await ctx.db.patch(args.productId, {
      revision: args.expectedRevision + 1,
    });

    await replaceProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });

    return {
      productId: args.productId,
      variantId: args.variantId,
    };
  },
};
