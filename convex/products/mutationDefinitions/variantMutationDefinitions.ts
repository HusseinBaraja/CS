import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';
import { refreshCompanyCatalogLanguageHintsInMutation } from '../../catalogLanguageHints';
import { replaceProductEmbeddingsInMutation } from '../../productEmbeddingRuntime';
import { NOT_FOUND_PREFIX, VALIDATION_PREFIX, createTaggedError } from '../errors';
import { mapVariant } from '../mapping';
import { createVariantPatch, normalizeVariantCreateState } from '../normalization';
import { getScopedProduct, getScopedVariant } from '../readers';
import type {
  DeleteProductVariantResult,
  ProductVariantDto,
} from '../types';

/**
 * Asserts that currency exists on the parent product when a variant has a price.
 */
const assertProductHasCurrency = async (
  ctx: MutationCtx,
  productId: Id<'products'>,
  variantPrice: number | undefined,
): Promise<void> => {
  if (variantPrice === undefined) {
    return;
  }

  const product = await ctx.db.get(productId);
  if (!product?.currency) {
    throw createTaggedError(VALIDATION_PREFIX, 'Product must have currency when a variant has a price');
  }
};

export const insertVariantWithEmbeddingsDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    label: v.string(),
    price: v.optional(v.number()),
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
      label: string;
      price?: number;
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

    const variantState = normalizeVariantCreateState({
      productId: args.productId,
      label: args.label,
      price: args.price,
    });

    await assertProductHasCurrency(ctx, args.productId, variantState.price);

    const variantId = await ctx.db.insert('productVariants', {
      companyId: args.companyId,
      productId: args.productId,
      label: variantState.label,
      ...(variantState.price !== undefined ? { price: variantState.price } : {}),
    });

    await replaceProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

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
    label: v.optional(v.string()),
    price: v.optional(v.union(v.number(), v.null())),
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
      label?: string;
      price?: number | null;
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

    const existingVariant = await getScopedVariant(ctx, args.companyId, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    const patch = createVariantPatch({
      label: args.label,
      price: args.price,
    });

    // Check currency if we're setting a price
    const effectivePrice = patch.price !== undefined ? patch.price : existingVariant.price;
    await assertProductHasCurrency(ctx, args.productId, effectivePrice);

    await ctx.db.patch(args.variantId, patch);

    await replaceProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

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

    const existingVariant = await getScopedVariant(ctx, args.companyId, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    await ctx.db.delete(args.variantId);

    await replaceProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

    return {
      productId: args.productId,
      variantId: args.variantId,
    };
  },
};
