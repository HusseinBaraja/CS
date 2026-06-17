import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';
import { refreshCompanyCatalogLanguageHintsInMutation } from '../../catalogLanguageHints';
import { NOT_FOUND_PREFIX, VALIDATION_PREFIX, createTaggedError } from '../errors';
import { mapUnit } from '../mapping';
import { getScopedProduct, getScopedUnit } from '../readers';
import type {
  DeleteProductUnitResult,
  ProductUnitDto,
} from '../types';

const assertUnitInput = (args: {
  labelEn?: string | null;
  labelAr?: string | null;
  price?: number;
}) => {
  if (!args.labelEn?.trim() && !args.labelAr?.trim()) {
    throw createTaggedError(VALIDATION_PREFIX, 'UNIT_MISSING_LABEL: Unit must have at least one label');
  }

  if (args.price !== undefined && args.price !== null && (!Number.isFinite(args.price) || args.price < 0)) {
    throw createTaggedError(VALIDATION_PREFIX, 'UNIT_INVALID_PRICE: Unit price must be a non-negative number');
  }
};

export const insertUnitDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    labelEn: v.optional(v.string()),
    labelAr: v.optional(v.string()),
    price: v.number(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      labelEn?: string;
      labelAr?: string;
      price: number;
      sortOrder?: number;
    },
  ): Promise<ProductUnitDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    assertUnitInput(args);
    const unitId = await ctx.db.insert('productUnits', {
      companyId: args.companyId,
      productId: args.productId,
      ...(args.labelEn?.trim() ? { labelEn: args.labelEn.trim() } : {}),
      ...(args.labelAr?.trim() ? { labelAr: args.labelAr.trim() } : {}),
      price: args.price,
      ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
    });
    await ctx.db.patch(args.productId, { version: (product.version ?? 0) + 1 });
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

    const unit = await ctx.db.get(unitId);
    if (!unit) {
      throw new Error('Created unit could not be loaded');
    }

    return mapUnit(unit);
  },
};

export const patchUnitDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    unitId: v.id('productUnits'),
    labelEn: v.optional(v.union(v.string(), v.null())),
    labelAr: v.optional(v.union(v.string(), v.null())),
    price: v.optional(v.number()),
    sortOrder: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      unitId: Id<'productUnits'>;
      labelEn?: string | null;
      labelAr?: string | null;
      price?: number;
      sortOrder?: number | null;
    },
  ): Promise<ProductUnitDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const existingUnit = await getScopedUnit(ctx, args.companyId, args.productId, args.unitId);
    if (!existingUnit) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Unit not found');
    }

    const nextLabelEn = args.labelEn === undefined ? existingUnit.labelEn : args.labelEn ?? undefined;
    const nextLabelAr = args.labelAr === undefined ? existingUnit.labelAr : args.labelAr ?? undefined;
    const nextPrice = args.price === undefined ? existingUnit.price : args.price;
    assertUnitInput({ labelEn: nextLabelEn, labelAr: nextLabelAr, price: nextPrice });

    await ctx.db.patch(args.unitId, {
      labelEn: nextLabelEn?.trim(),
      labelAr: nextLabelAr?.trim(),
      price: nextPrice,
      sortOrder: args.sortOrder === null ? undefined : args.sortOrder ?? existingUnit.sortOrder,
    });
    await ctx.db.patch(args.productId, { version: (product.version ?? 0) + 1 });
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

    const unit = await ctx.db.get(args.unitId);
    if (!unit) {
      throw new Error('Updated unit could not be loaded');
    }

    return mapUnit(unit);
  },
};

export const removeUnitDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
    unitId: v.id('productUnits'),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
      unitId: Id<'productUnits'>;
    },
  ): Promise<DeleteProductUnitResult | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const existingUnit = await getScopedUnit(ctx, args.companyId, args.productId, args.unitId);
    if (!existingUnit) {
      throw createTaggedError(NOT_FOUND_PREFIX, 'Unit not found');
    }

    await ctx.db.delete(args.unitId);
    await ctx.db.patch(args.productId, { version: (product.version ?? 0) + 1 });
    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);

    return {
      productId: args.productId,
      unitId: args.unitId,
    };
  },
};
