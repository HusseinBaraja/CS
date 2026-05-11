import type { CleanupCounters, CleanupDb, DocCursor } from './catalogRestructureCleanupShared';
import {
  companyExists,
  deleteCleanupDoc,
  firstImageKey,
  hasPatchChanges,
  numberOrUndefined,
  patchCleanupDoc,
  processDocs,
  stringOrUndefined,
} from './catalogRestructureCleanupShared';

export const processProducts = (
  db: CleanupDb,
  table: 'products',
  limit: number,
  counters: CleanupCounters,
  cursor?: DocCursor,
) =>
  processDocs(db, table, limit, cursor, async (product) => {
    if (!(await companyExists(db, product.companyId))) {
      await deleteCleanupDoc(db, product._id);
      counters.productsDeleted += 1;
      return;
    }
    const price = numberOrUndefined(product.price) ?? numberOrUndefined(product.basePrice);
    const currency = stringOrUndefined(product.currency) ?? stringOrUndefined(product.baseCurrency);
    const minimalPatch = {
      price: currency ? price : undefined,
      currency,
      primaryImage: stringOrUndefined(product.primaryImage) ?? firstImageKey(product.images),
      productId: undefined,
      basePrice: undefined,
      baseCurrency: undefined,
      specifications: undefined,
      images: undefined,
    };
    if (hasPatchChanges(product, minimalPatch)) {
      await patchCleanupDoc(db, product._id, minimalPatch);
      counters.productsUpdated += 1;
    }
  });
