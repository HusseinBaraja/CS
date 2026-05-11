import { VALIDATION_PREFIX, createTaggedError } from './errors';

export const assertValidMergedProduct = (product: {
  nameEn?: string;
  nameAr?: string;
  price?: number;
  currency?: string;
}): void => {
  if (!product.nameEn && !product.nameAr) {
    throw createTaggedError(VALIDATION_PREFIX, 'at least one of nameEn or nameAr is required');
  }
  if (product.price !== undefined && !product.currency) {
    throw createTaggedError(VALIDATION_PREFIX, 'currency is required when a price is set');
  }
  if (product.currency && product.price === undefined) {
    throw createTaggedError(VALIDATION_PREFIX, 'price is required when a currency is set');
  }
};
