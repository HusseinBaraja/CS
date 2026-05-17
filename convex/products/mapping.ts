import type { Doc } from '../_generated/dataModel';
import { mapProductDocToEmbeddingState } from '../productEmbeddingRuntime';
import type {
  ProductDetailDto,
  ProductListItemDto,
  ProductVariantDoc,
  ProductVariantDto,
  ProductVariantWriteState,
  ProductWriteState,
} from './types';

export const mapVariant = (variant: ProductVariantDoc): ProductVariantDto => ({
  id: variant._id,
  companyId: variant.companyId,
  productId: variant.productId,
  ...(variant.labelEn ? { labelEn: variant.labelEn } : {}),
  ...(variant.labelAr ? { labelAr: variant.labelAr } : {}),
  ...(variant.price !== undefined ? { price: variant.price } : {}),
});

export const mapProduct = (product: Doc<'products'>): ProductListItemDto => ({
  id: product._id,
  companyId: product.companyId,
  categoryId: product.categoryId,
  ...(product.productNo ? { productNo: product.productNo } : {}),
  ...(product.nameEn ? { nameEn: product.nameEn } : {}),
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.price !== undefined ? { price: product.price } : {}),
  ...(product.currency ? { currency: product.currency } : {}),
  ...(product.primaryImage ? { primaryImage: product.primaryImage } : {}),
});

export const mapProductDetail = (
  product: Doc<'products'>,
  variants: ProductVariantDoc[],
): ProductDetailDto => ({
  ...mapProduct(product),
  variants: variants.map(mapVariant),
});

export const toWriteState = mapProductDocToEmbeddingState;

export const toVariantWriteState = (variant: ProductVariantDto): ProductVariantWriteState => ({
  id: variant.id,
  productId: variant.productId,
  ...(variant.labelEn ? { labelEn: variant.labelEn } : {}),
  ...(variant.labelAr ? { labelAr: variant.labelAr } : {}),
  ...(variant.price !== undefined ? { price: variant.price } : {}),
});

export const sortProducts = <T extends ProductListItemDto>(products: T[]): T[] =>
  products.sort((left, right) => {
    const leftName = left.nameEn ?? left.nameAr ?? '';
    const rightName = right.nameEn ?? right.nameAr ?? '';
    return leftName.localeCompare(rightName) || left.id.localeCompare(right.id);
  });

const getVariantSortLabel = (variant: { labelEn?: string; labelAr?: string }): string =>
  variant.labelEn ?? variant.labelAr ?? '';

export const sortVariantDocs = <T extends { labelEn?: string; labelAr?: string; _id: string }>(variants: T[]): T[] =>
  variants.sort((left, right) =>
    getVariantSortLabel(left).localeCompare(getVariantSortLabel(right)) || left._id.localeCompare(right._id)
  );

export const sortVariants = <T extends ProductVariantWriteState | ProductVariantDto>(variants: T[]): T[] =>
  variants.sort((left, right) =>
    getVariantSortLabel(left).localeCompare(getVariantSortLabel(right)) || left.id.localeCompare(right.id)
  );

export const buildSearchText = (product: ProductListItemDto): string =>
  [
    product.nameEn,
    product.nameAr,
    product.descriptionEn,
    product.descriptionAr,
    product.productNo,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLocaleLowerCase();

export const hasEmbeddingRelevantChanges = (
  previous: ProductWriteState,
  next: ProductWriteState,
): boolean =>
  previous.nameEn !== next.nameEn
  || previous.nameAr !== next.nameAr
  || previous.descriptionEn !== next.descriptionEn
  || previous.descriptionAr !== next.descriptionAr
  || previous.price !== next.price
  || previous.currency !== next.currency;
