import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

export const getProductsByInteractedId = async (
  ctx: QueryCtx,
  companyId: Id<'companies'>,
  interactedProductIds: Set<string>,
): Promise<Map<string, Doc<'products'>>> => {
  const productIds = Array.from(interactedProductIds)
    .map((productId) => ctx.db.normalizeId('products', productId))
    .filter((productId): productId is Id<'products'> => productId !== null);

  if (productIds.length === 0) {
    return new Map();
  }

  const products = await Promise.all(productIds.map((productId) => ctx.db.get(productId)));

  return new Map(
    products
      .filter((product): product is Doc<'products'> => product !== null && product.companyId === companyId)
      .map((product) => [product._id, product] as const),
  );
};
