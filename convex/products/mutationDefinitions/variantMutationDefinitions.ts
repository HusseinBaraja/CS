import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';
import { refreshCompanyCatalogLanguageHintsInMutation } from '../../catalogLanguageHints';
import { replaceProductEmbeddingsInMutation } from '../../productEmbeddingRuntime';
import { CONFLICT_PREFIX, NOT_FOUND_PREFIX, createTaggedError } from '../errors';
import { mapVariant } from '../mapping';
import {
  assertCurrencyIfPriced,
  createVariantPatch,
  normalizeVariantCreateState,
} from '../normalization';
import { getScopedProduct, getScopedVariant } from '../readers';
import type {
  DeleteProductVariantResult,
  ProductVariantDto,
} from '../types';
import { applyVariantEmbeddingMutation } from './variantEmbeddingMutations';

const assertExpectedRevision = (
  currentRevision: number,
  expectedRevision: number,
): void => {
  if (currentRevision !== expectedRevision) {
    throw createTaggedError(CONFLICT_PREFIX, 'Product was modified concurrently; retry the update');
  }
};

export const insertVariantWithEmbeddingsDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    expectedRevision: v.number(),
    labelEn: v.optional(v.string()),
    labelAr: v.optional(v.string()),
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
      expectedRevision: number;
      labelEn?: string;
      labelAr?: string;
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
    const currentRevision = product.version ?? 0;
    assertExpectedRevision(currentRevision, args.expectedRevision);

    const variantState = normalizeVariantCreateState(
      {
        productId: args.productId,
        labelEn: args.labelEn,
        labelAr: args.labelAr,
        price: args.price,
      },
      product.currency,
    );

    const variantId = await ctx.db.insert('productVariants', {
      companyId: args.companyId,
      productId: args.productId,
      ...(variantState.labelEn ? { labelEn: variantState.labelEn } : {}),
      ...(variantState.labelAr ? { labelAr: variantState.labelAr } : {}),
      ...(variantState.price !== undefined ? { price: variantState.price } : {}),
    });
    await ctx.db.patch(args.productId, { version: currentRevision + 1 });

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
    expectedRevision: v.number(),
    labelEn: v.optional(v.union(v.string(), v.null())),
    labelAr: v.optional(v.union(v.string(), v.null())),
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
      expectedRevision: number;
      labelEn?: string | null;
      labelAr?: string | null;
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
    const currentRevision = product.version ?? 0;
    assertExpectedRevision(currentRevision, args.expectedRevision);

    const existingVariant = await getScopedVariant(ctx, args.companyId, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    const patch = createVariantPatch({
      labelEn: args.labelEn,
      labelAr: args.labelAr,
      price: args.price,
    });

    const mergedLabelEn = args.labelEn !== undefined ? args.labelEn : existingVariant.labelEn;
    const mergedLabelAr = args.labelAr !== undefined ? args.labelAr : existingVariant.labelAr;
    if (!mergedLabelEn?.trim() && !mergedLabelAr?.trim()) {
      throw new Error('Variant must have at least one label');
    }

    if (Object.keys(patch).length === 0) {
      return mapVariant(existingVariant);
    }

    const effectivePrice: number | undefined =
      args.price === null
        ? undefined
        : patch.price !== undefined
          ? patch.price
          : existingVariant.price;
    assertCurrencyIfPriced(effectivePrice, product.currency);

    await ctx.db.patch(args.variantId, patch);
    await ctx.db.patch(args.productId, { version: currentRevision + 1 });

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
    expectedRevision: v.number(),
    clearEmbeddings: v.optional(v.boolean()),
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
      variantId: Id<'productVariants'>;
      expectedRevision: number;
      clearEmbeddings?: boolean;
      englishEmbedding?: number[];
      arabicEmbedding?: number[];
      englishText?: string;
      arabicText?: string;
    },
  ): Promise<DeleteProductVariantResult | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }
    const currentRevision = product.version ?? 0;
    assertExpectedRevision(currentRevision, args.expectedRevision);

    const existingVariant = await getScopedVariant(ctx, args.companyId, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Variant not found');
    }

    await ctx.db.delete(args.variantId);
    await ctx.db.patch(args.productId, { version: currentRevision + 1 });

    await applyVariantEmbeddingMutation(ctx, args);
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

    return {
      productId: args.productId,
      variantId: args.variantId,
    };
  },
};
