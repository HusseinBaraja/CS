import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type {
  ProductEmbeddingVariantState as ProductVariantWriteState,
  ProductEmbeddingProductState as ProductWriteState,
} from '../productEmbeddingRuntime';

export type {
  ProductVariantWriteState,
  ProductWriteState,
};

/** Extends ProductWriteState with non-embedding product fields. */
export type ProductCreateState = ProductWriteState & {
  primaryImage?: string;
};

export type ProductVariantDto = {
  id: string;
  companyId: string;
  productId: string;
  label: string;
  price?: number;
};

export type ProductListItemDto = {
  id: string;
  companyId: string;
  categoryId: string;
  productNo?: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
  primaryImage?: string;
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
  productNo?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  price?: number | null;
  currency?: string | null;
  primaryImage?: string | null;
};

export type ProductWriteSnapshot = ProductWriteState & {
  productId: Id<'products'>;
  primaryImage?: string;
};

export type ProductVariantCreateArgs = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  label: string;
  price?: number;
};

export type ProductVariantUpdateArgs = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  variantId: Id<'productVariants'>;
  label?: string;
  price?: number | null;
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
  productNo?: string | undefined;
  nameEn?: string | undefined;
  nameAr?: string | undefined;
  descriptionEn?: string | undefined;
  descriptionAr?: string | undefined;
  price?: number | undefined;
  currency?: string | undefined;
  primaryImage?: string | undefined;
};

export type ProductVariantPatch = {
  label?: string;
  price?: number | undefined;
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
