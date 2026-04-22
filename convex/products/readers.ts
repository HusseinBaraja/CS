import type { Doc, Id } from '../_generated/dataModel';
import type {
  ProductReader,
  ProductVariantCreateSnapshot,
  ProductVariantDoc,
} from './types';
import { mapVariant, sortVariantDocs, toWriteState } from './mapping';

export const getCompany = async (ctx: ProductReader, companyId: Id<'companies'>) =>
  ctx.db.get(companyId);

export const getScopedCategory = async (
  ctx: ProductReader,
  companyId: Id<'companies'>,
  categoryId: Id<'categories'>,
): Promise<Doc<'categories'> | null> => {
  const category = await ctx.db.get(categoryId);
  if (!category || category.companyId !== companyId) {
    return null;
  }

  return category;
};

export const getScopedProduct = async (
  ctx: ProductReader,
  companyId: Id<'companies'>,
  productId: Id<'products'>,
): Promise<Doc<'products'> | null> => {
  const product = await ctx.db.get(productId);
  if (!product || product.companyId !== companyId) {
    return null;
  }

  return product;
};

export const getScopedVariant = async (
  ctx: ProductReader,
  productId: Id<'products'>,
  variantId: Id<'productVariants'>,
): Promise<Doc<'productVariants'> | null> => {
  const variant = await ctx.db.get(variantId);
  if (!variant || variant.productId !== productId) {
    return null;
  }

  return variant;
};

export const getProductVariants = async (
  ctx: ProductReader,
  productId: Id<'products'>,
): Promise<ProductVariantDoc[]> =>
  sortVariantDocs(
    await ctx.db
      .query('productVariants')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect(),
  );

export const getVariantCreateSnapshotData = async (
  ctx: ProductReader,
  companyId: Id<'companies'>,
  productId: Id<'products'>,
): Promise<ProductVariantCreateSnapshot | null> => {
  const product = await getScopedProduct(ctx, companyId, productId);
  if (!product) {
    return null;
  }

  const variants = await getProductVariants(ctx, productId);
  return {
    productId: product._id,
    expectedRevision: product.revision ?? 0,
    ...toWriteState(product),
    variants: variants.map(mapVariant),
  };
};
