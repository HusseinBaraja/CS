import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type {
  ProductEmbeddingSpecifications as ProductSpecifications,
  ProductEmbeddingVariantAttributeValue as ProductVariantAttributeValue,
  ProductEmbeddingVariantAttributes as ProductVariantAttributes,
  ProductEmbeddingVariantState as ProductVariantWriteState,
  ProductEmbeddingProductState as ProductWriteState,
} from '../productEmbeddingRuntime';

export type {
  ProductSpecifications,
  ProductVariantAttributeValue,
  ProductVariantAttributes,
  ProductVariantWriteState,
  ProductWriteState,
};

const flexValue = v.union(v.string(), v.number(), v.boolean());

export const flexRecord = v.record(v.string(), flexValue);
export const variantAttributesValidator = v.record(v.string(), v.any());

export type ProductVariantDto = {
  id: string;
  productId: string;
  variantLabel: string;
  attributes: ProductVariantAttributes;
  priceOverride?: number;
};

export type ProductImageDto = {
  id: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  etag?: string;
  alt?: string;
  uploadedAt: number;
};

export type ProductListItemDto = {
  id: string;
  companyId: string;
  categoryId: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: ProductSpecifications;
  basePrice?: number;
  baseCurrency?: string;
  images: ProductImageDto[];
};

export type ProductDetailDto = ProductListItemDto & {
  variants: ProductVariantDto[];
};

export type DeleteProductResult = {
  productId: string;
};

export type DeleteProductVariantResult = {
  productId: string;
  variantId: string;
};

export type ProductUpdateArgs = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  categoryId?: Id<'categories'>;
  nameEn?: string;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  specifications?: ProductSpecifications | null;
  basePrice?: number | null;
  baseCurrency?: string | null;
};

export type ProductWriteSnapshot = ProductWriteState & {
  productId: Id<'products'>;
  expectedRevision: number;
};

export type ProductVariantCreateArgs = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  variantLabel: string;
  attributes: ProductVariantAttributes;
  priceOverride?: number;
};

export type ProductVariantUpdateArgs = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  variantId: Id<'productVariants'>;
  variantLabel?: string;
  attributes?: ProductVariantAttributes;
  priceOverride?: number | null;
};

export type ProductVariantCreateSnapshot = ProductWriteSnapshot & {
  variants: ProductVariantDto[];
};

export type ProductVariantUpdateSnapshot = ProductVariantCreateSnapshot & {
  targetVariant: ProductVariantDto | null;
};

export type ProductReader = {
  db: Pick<MutationCtx['db'], 'get' | 'query'>;
};

export type ProductPatch = {
  categoryId?: Id<'categories'>;
  nameEn?: string;
  nameAr?: string | undefined;
  descriptionEn?: string | undefined;
  descriptionAr?: string | undefined;
  specifications?: ProductSpecifications | undefined;
  basePrice?: number | undefined;
  baseCurrency?: string | undefined;
};

export type ProductVariantPatch = {
  variantLabel?: string;
  attributes?: ProductVariantAttributes;
  priceOverride?: number | undefined;
};

export type ProductEmbeddingReplacementInput = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  englishEmbedding?: number[];
  arabicEmbedding?: number[];
  englishText?: string;
  arabicText?: string;
};

export type ProductEmbeddingReplacementArgs = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  englishEmbedding: number[];
  arabicEmbedding: number[];
  englishText: string;
  arabicText: string;
};

export type ProductDoc = Doc<'products'>;
export type ProductVariantDoc = Doc<'productVariants'>;
