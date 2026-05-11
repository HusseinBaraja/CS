import type { CleanupCounters, DocCursor } from './catalogRestructureCleanupShared';
import {
  companyExists,
  firstImageKey,
  numberOrUndefined,
  processDocs,
  stringOrUndefined,
} from './catalogRestructureCleanupShared';

export const processProducts = (
  db: any,
  table: string,
  limit: number,
  counters: CleanupCounters,
  cursor?: DocCursor,
) =>
  processDocs(db, table, limit, cursor, async (product) => {
    if (!(await companyExists(db, product.companyId))) {
      await db.delete(product._id);
      counters.productsDeleted += 1;
      return;
    }
    const price = numberOrUndefined(product.price) ?? numberOrUndefined(product.basePrice);
    const currency = stringOrUndefined(product.currency) ?? stringOrUndefined(product.baseCurrency);
    await db.patch(product._id, {
      price: currency ? price : undefined,
      currency,
      primaryImage: stringOrUndefined(product.primaryImage) ?? firstImageKey(product.images),
      productId: undefined,
      basePrice: undefined,
      baseCurrency: undefined,
      specifications: undefined,
      images: undefined,
    });
    counters.productsUpdated += 1;
  });
