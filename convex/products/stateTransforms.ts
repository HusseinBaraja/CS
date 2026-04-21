import type { Id } from '../_generated/dataModel';
import type {
  ProductPatch,
  ProductSpecifications,
  ProductUpdateArgs,
  ProductVariantCreateArgs,
  ProductVariantPatch,
  ProductVariantUpdateArgs,
  ProductVariantWriteState,
  ProductWriteSnapshot,
  ProductWriteState,
} from './types';
import {
  normalizeOptionalNumber,
  normalizeOptionalString,
  normalizeRequiredString,
  normalizeSpecifications,
  normalizeVariantAttributes,
} from './normalizationPrimitives';

export const normalizeVariantCreateState = (
  args: Pick<ProductVariantCreateArgs, 'productId' | 'variantLabel' | 'attributes' | 'priceOverride'>,
): ProductVariantWriteState => {
  const normalizedPriceOverride = normalizeOptionalNumber(args.priceOverride, 'priceOverride');

  return {
    id: '~new',
    productId: args.productId,
    variantLabel: normalizeRequiredString(args.variantLabel, 'variantLabel'),
    attributes: normalizeVariantAttributes(args.attributes),
    ...(normalizedPriceOverride !== undefined ? { priceOverride: normalizedPriceOverride } : {}),
  };
};

export const mergeVariantUpdateState = (
  existingVariant: ProductVariantWriteState,
  patch: Pick<ProductVariantUpdateArgs, 'variantLabel' | 'attributes' | 'priceOverride'>,
): ProductVariantWriteState => {
  const normalizedPriceOverride =
    patch.priceOverride !== undefined
      ? normalizeOptionalNumber(patch.priceOverride, 'priceOverride')
      : undefined;

  return {
    id: existingVariant.id,
    productId: existingVariant.productId,
    variantLabel:
      patch.variantLabel !== undefined
        ? normalizeRequiredString(patch.variantLabel, 'variantLabel')
        : existingVariant.variantLabel,
    attributes:
      patch.attributes !== undefined
        ? normalizeVariantAttributes(patch.attributes)
        : existingVariant.attributes,
    ...(patch.priceOverride !== undefined
      ? (normalizedPriceOverride !== undefined ? { priceOverride: normalizedPriceOverride } : {})
      : (existingVariant.priceOverride !== undefined ? { priceOverride: existingVariant.priceOverride } : {})),
  };
};

export const createVariantPatch = (
  args: Pick<ProductVariantUpdateArgs, 'variantLabel' | 'attributes' | 'priceOverride'>,
): ProductVariantPatch => {
  const patch: ProductVariantPatch = {};

  if (args.variantLabel !== undefined) {
    patch.variantLabel = normalizeRequiredString(args.variantLabel, 'variantLabel');
  }

  if (args.attributes !== undefined) {
    patch.attributes = normalizeVariantAttributes(args.attributes);
  }

  if (args.priceOverride !== undefined) {
    patch.priceOverride = normalizeOptionalNumber(args.priceOverride, 'priceOverride');
  }

  return patch;
};

export const normalizeCreateState = (args: {
  companyId: Id<'companies'>;
  categoryId: Id<'categories'>;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: ProductSpecifications;
  basePrice?: number;
  baseCurrency?: string;
}): ProductWriteState => {
  const nameAr = normalizeOptionalString(args.nameAr);
  const descriptionEn = normalizeOptionalString(args.descriptionEn);
  const descriptionAr = normalizeOptionalString(args.descriptionAr);
  const specifications = normalizeSpecifications(args.specifications);
  const basePrice = normalizeOptionalNumber(args.basePrice, 'basePrice');
  const baseCurrency = normalizeOptionalString(args.baseCurrency);

  return {
    companyId: args.companyId,
    categoryId: args.categoryId,
    nameEn: normalizeRequiredString(args.nameEn, 'nameEn'),
    ...(nameAr ? { nameAr } : {}),
    ...(descriptionEn ? { descriptionEn } : {}),
    ...(descriptionAr ? { descriptionAr } : {}),
    ...(specifications ? { specifications } : {}),
    ...(basePrice !== undefined ? { basePrice } : {}),
    ...(baseCurrency ? { baseCurrency } : {}),
  };
};

export const mergeUpdateState = (
  existingProduct: ProductWriteSnapshot,
  patch: ProductUpdateArgs,
): ProductWriteState => {
  const nameAr = patch.nameAr !== undefined ? normalizeOptionalString(patch.nameAr) : existingProduct.nameAr;
  const descriptionEn =
    patch.descriptionEn !== undefined
      ? normalizeOptionalString(patch.descriptionEn)
      : existingProduct.descriptionEn;
  const descriptionAr =
    patch.descriptionAr !== undefined
      ? normalizeOptionalString(patch.descriptionAr)
      : existingProduct.descriptionAr;
  const specifications =
    patch.specifications !== undefined
      ? normalizeSpecifications(patch.specifications)
      : existingProduct.specifications;
  const basePrice =
    patch.basePrice !== undefined
      ? normalizeOptionalNumber(patch.basePrice, 'basePrice')
      : existingProduct.basePrice;
  const baseCurrency =
    patch.baseCurrency !== undefined
      ? normalizeOptionalString(patch.baseCurrency)
      : existingProduct.baseCurrency;

  return {
    companyId: existingProduct.companyId,
    categoryId: patch.categoryId ?? existingProduct.categoryId,
    nameEn:
      patch.nameEn !== undefined
        ? normalizeRequiredString(patch.nameEn, 'nameEn')
        : existingProduct.nameEn,
    ...(nameAr ? { nameAr } : {}),
    ...(descriptionEn ? { descriptionEn } : {}),
    ...(descriptionAr ? { descriptionAr } : {}),
    ...(specifications ? { specifications } : {}),
    ...(basePrice !== undefined ? { basePrice } : {}),
    ...(baseCurrency ? { baseCurrency } : {}),
  };
};

export const createProductPatch = (args: ProductUpdateArgs): ProductPatch => {
  const patch: ProductPatch = {};

  if (args.categoryId !== undefined) {
    patch.categoryId = args.categoryId;
  }

  if (args.nameEn !== undefined) {
    patch.nameEn = normalizeRequiredString(args.nameEn, 'nameEn');
  }

  if (args.nameAr !== undefined) {
    patch.nameAr = normalizeOptionalString(args.nameAr);
  }

  if (args.descriptionEn !== undefined) {
    patch.descriptionEn = normalizeOptionalString(args.descriptionEn);
  }

  if (args.descriptionAr !== undefined) {
    patch.descriptionAr = normalizeOptionalString(args.descriptionAr);
  }

  if (args.specifications !== undefined) {
    patch.specifications = normalizeSpecifications(args.specifications);
  }

  if (args.basePrice !== undefined) {
    patch.basePrice = normalizeOptionalNumber(args.basePrice, 'basePrice');
  }

  if (args.baseCurrency !== undefined) {
    patch.baseCurrency = normalizeOptionalString(args.baseCurrency);
  }

  return patch;
};
