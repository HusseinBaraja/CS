import type { Id } from '../_generated/dataModel';
import type {
  ProductCreateState,
  ProductPatch,
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
} from './normalizationPrimitives';
import { VALIDATION_PREFIX, createTaggedError } from './errors';

/**
 * Validates that currency is present whenever a price is set.
 * This applies to both product-level price and variant prices.
 */
const assertCurrencyIfPriced = (price: number | undefined, currency: string | undefined): void => {
  if (price !== undefined && !currency) {
    throw createTaggedError(VALIDATION_PREFIX, 'currency is required when a price is set');
  }
};

/**
 * Validates that at least one of nameEn or nameAr is present.
 */
const assertAtLeastOneName = (nameEn: string | undefined, nameAr: string | undefined): void => {
  if (!nameEn && !nameAr) {
    throw createTaggedError(VALIDATION_PREFIX, 'at least one of nameEn or nameAr is required');
  }
};

export const normalizeVariantCreateState = (
  args: Pick<ProductVariantCreateArgs, 'productId' | 'label' | 'price'>,
): ProductVariantWriteState => {
  const normalizedPrice = normalizeOptionalNumber(args.price, 'price');

  return {
    id: '~new',
    productId: args.productId,
    label: normalizeRequiredString(args.label, 'label'),
    ...(normalizedPrice !== undefined ? { price: normalizedPrice } : {}),
  };
};

export const mergeVariantUpdateState = (
  existingVariant: ProductVariantWriteState,
  patch: Pick<ProductVariantUpdateArgs, 'label' | 'price'>,
): ProductVariantWriteState => {
  const normalizedPrice =
    patch.price !== undefined
      ? normalizeOptionalNumber(patch.price, 'price')
      : undefined;

  return {
    id: existingVariant.id,
    productId: existingVariant.productId,
    label:
      patch.label !== undefined
        ? normalizeRequiredString(patch.label, 'label')
        : existingVariant.label,
    ...(patch.price !== undefined
      ? (normalizedPrice !== undefined ? { price: normalizedPrice } : {})
      : (existingVariant.price !== undefined ? { price: existingVariant.price } : {})),
  };
};

export const createVariantPatch = (
  args: Pick<ProductVariantUpdateArgs, 'label' | 'price'>,
): ProductVariantPatch => {
  const patch: ProductVariantPatch = {};

  if (args.label !== undefined) {
    patch.label = normalizeRequiredString(args.label, 'label');
  }

  if (args.price !== undefined) {
    patch.price = normalizeOptionalNumber(args.price, 'price');
  }

  return patch;
};

export const normalizeCreateState = (args: {
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
}): ProductCreateState => {
  const productNo = normalizeOptionalString(args.productNo);
  const nameEn = normalizeOptionalString(args.nameEn);
  const nameAr = normalizeOptionalString(args.nameAr);
  const descriptionEn = normalizeOptionalString(args.descriptionEn);
  const descriptionAr = normalizeOptionalString(args.descriptionAr);
  const price = normalizeOptionalNumber(args.price, 'price');
  const currency = normalizeOptionalString(args.currency);
  const primaryImage = normalizeOptionalString(args.primaryImage);

  assertAtLeastOneName(nameEn, nameAr);
  assertCurrencyIfPriced(price, currency);

  return {
    companyId: args.companyId,
    categoryId: args.categoryId,
    ...(productNo ? { productNo } : {}),
    ...(nameEn ? { nameEn } : {}),
    ...(nameAr ? { nameAr } : {}),
    ...(descriptionEn ? { descriptionEn } : {}),
    ...(descriptionAr ? { descriptionAr } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(currency ? { currency } : {}),
    ...(primaryImage ? { primaryImage } : {}),
  };
};

export const mergeUpdateState = (
  existingProduct: ProductWriteSnapshot,
  patch: ProductUpdateArgs,
): ProductWriteState => {
  const productNo =
    patch.productNo !== undefined ? normalizeOptionalString(patch.productNo) : existingProduct.productNo;
  const nameEn = patch.nameEn !== undefined ? normalizeOptionalString(patch.nameEn) : existingProduct.nameEn;
  const nameAr = patch.nameAr !== undefined ? normalizeOptionalString(patch.nameAr) : existingProduct.nameAr;
  const descriptionEn =
    patch.descriptionEn !== undefined
      ? normalizeOptionalString(patch.descriptionEn)
      : existingProduct.descriptionEn;
  const descriptionAr =
    patch.descriptionAr !== undefined
      ? normalizeOptionalString(patch.descriptionAr)
      : existingProduct.descriptionAr;
  const price =
    patch.price !== undefined
      ? normalizeOptionalNumber(patch.price, 'price')
      : existingProduct.price;
  const currency =
    patch.currency !== undefined
      ? normalizeOptionalString(patch.currency)
      : existingProduct.currency;
  const primaryImage =
    patch.primaryImage !== undefined
      ? normalizeOptionalString(patch.primaryImage)
      : existingProduct.primaryImage;

  assertAtLeastOneName(nameEn, nameAr);
  assertCurrencyIfPriced(price, currency);

  return {
    companyId: existingProduct.companyId,
    categoryId: patch.categoryId ?? existingProduct.categoryId,
    ...(productNo ? { productNo } : {}),
    ...(nameEn ? { nameEn } : {}),
    ...(nameAr ? { nameAr } : {}),
    ...(descriptionEn ? { descriptionEn } : {}),
    ...(descriptionAr ? { descriptionAr } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(currency ? { currency } : {}),
    ...(primaryImage ? { primaryImage } : {}),
  };
};

export const createProductPatch = (args: ProductUpdateArgs): ProductPatch => {
  const patch: ProductPatch = {};

  if (args.categoryId !== undefined) {
    patch.categoryId = args.categoryId;
  }

  if (args.productNo !== undefined) {
    patch.productNo = normalizeOptionalString(args.productNo);
  }

  if (args.nameEn !== undefined) {
    patch.nameEn = normalizeOptionalString(args.nameEn);
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

  if (args.price !== undefined) {
    patch.price = normalizeOptionalNumber(args.price, 'price');
  }

  if (args.currency !== undefined) {
    patch.currency = normalizeOptionalString(args.currency);
  }

  if (args.primaryImage !== undefined) {
    patch.primaryImage = normalizeOptionalString(args.primaryImage);
  }

  return patch;
};
