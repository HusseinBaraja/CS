import type { Doc } from '../_generated/dataModel';
import { mapProductDocToEmbeddingState } from '../productEmbeddingRuntime';
import type {
  ProductDetailDto,
  ProductImageDto,
  ProductListItemDto,
  ProductSpecifications,
  ProductVariantDoc,
  ProductVariantDto,
  ProductVariantWriteState,
  ProductWriteState,
} from './types';

const mapImage = (image: {
  id: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  etag?: string;
  alt?: string;
  uploadedAt: number;
}): ProductImageDto => ({
  id: image.id,
  key: image.key,
  contentType: image.contentType,
  sizeBytes: image.sizeBytes,
  ...(image.etag ? { etag: image.etag } : {}),
  ...(image.alt ? { alt: image.alt } : {}),
  uploadedAt: image.uploadedAt,
});

export const mapVariant = (variant: ProductVariantDoc): ProductVariantDto => ({
  id: variant._id,
  productId: variant.productId,
  variantLabel: variant.variantLabel,
  attributes: variant.attributes,
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
});

export const mapProduct = (product: Doc<'products'>): ProductListItemDto => ({
  id: product._id,
  companyId: product.companyId,
  categoryId: product.categoryId,
  nameEn: product.nameEn,
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.specifications ? { specifications: product.specifications } : {}),
  ...(product.basePrice !== undefined ? { basePrice: product.basePrice } : {}),
  ...(product.baseCurrency ? { baseCurrency: product.baseCurrency } : {}),
  images: (product.images ?? []).map(mapImage),
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
  variantLabel: variant.variantLabel,
  attributes: variant.attributes,
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
});

export const sortProducts = <T extends ProductListItemDto>(products: T[]): T[] =>
  products.sort((left, right) => left.nameEn.localeCompare(right.nameEn) || left.id.localeCompare(right.id));

export const sortVariantDocs = <T extends { variantLabel: string; _id: string }>(variants: T[]): T[] =>
  variants.sort((left, right) =>
    left.variantLabel.localeCompare(right.variantLabel) || left._id.localeCompare(right._id)
  );

export const sortVariants = <T extends ProductVariantWriteState | ProductVariantDto>(variants: T[]): T[] =>
  variants.sort((left, right) =>
    left.variantLabel.localeCompare(right.variantLabel) || left.id.localeCompare(right.id)
  );

export const buildSearchText = (product: ProductListItemDto): string =>
  [
    product.nameEn,
    product.nameAr,
    product.descriptionEn,
    product.descriptionAr,
    product.specifications
      ? Object.entries(product.specifications)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join('\n')
      : '',
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLocaleLowerCase();

const canonicalizeSpecs = (specs: ProductSpecifications | undefined): string => {
  if (!specs) return '{}';
  const sortedKeys = Object.keys(specs).sort();
  return JSON.stringify(sortedKeys.map((key) => [key, specs[key]]));
};

export const hasEmbeddingRelevantChanges = (
  previous: ProductWriteState,
  next: ProductWriteState,
): boolean =>
  previous.nameEn !== next.nameEn
  || previous.nameAr !== next.nameAr
  || previous.descriptionEn !== next.descriptionEn
  || previous.descriptionAr !== next.descriptionAr
  || canonicalizeSpecs(previous.specifications) !== canonicalizeSpecs(next.specifications);
