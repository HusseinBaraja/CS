import { processProducts } from './catalogRestructureCleanupProducts';
import {
  type CleanupCounters,
  type DocCursor,
  companyExists,
  hasPatchChanges,
  numberOrUndefined,
  processDocs,
  stringOrUndefined,
} from './catalogRestructureCleanupShared';
export type { CleanupCounters, DocCursor } from './catalogRestructureCleanupShared';

const TENANT_TABLES = [
  'embeddings',
  'productImageUploads',
  'mediaCleanupJobs',
  'botRuntimeSessions',
  'botRuntimePairingArtifacts',
  'conversationStateEvents',
  'conversations',
  'offers',
  'currencyRates',
  'analyticsEvents',
  'companySettings',
] as const;

const LEGACY_TABLES = [
  'assistantSemanticRecords',
  'conversationCanonicalStates',
  'conversationSummaries',
] as const;

export const CLEANUP_TABLES = [
  'categories',
  'products',
  'productVariants',
  'messages',
  ...TENANT_TABLES,
  ...LEGACY_TABLES,
] as const;

export type CleanupTable = (typeof CLEANUP_TABLES)[number];

const normalizeNameKey = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
};

export const normalizeBatchLimit = (value: number | undefined): number => {
  const limit = value ?? 200;
  if (!Number.isFinite(limit)) {
    throw new Error('limit must be a finite number');
  }

  return Math.max(1, Math.trunc(limit));
};

export const processCleanupTable = async (
  db: any,
  table: CleanupTable,
  limit: number,
  counters: CleanupCounters,
  cursor?: DocCursor,
): Promise<{ processed: number; nextCursor: DocCursor | null; completed: boolean }> => {
  if (table === 'categories') {
    return processDocs(db, table, limit, cursor, async (category) => {
      if (!(await companyExists(db, category.companyId))) {
        await db.delete(category._id);
        counters.orphanDeleted += 1;
        return;
      }
      if (!category.nameKey) {
        const nameKey = normalizeNameKey(category.nameAr) ?? normalizeNameKey(category.nameEn);
        if (nameKey) {
          await db.patch(category._id, { nameKey });
          counters.categoriesUpdated += 1;
        }
      }
    });
  }
  if (table === 'products') {
    return processProducts(db, table, limit, counters, cursor);
  }
  if (table === 'productVariants') {
    return processDocs(db, table, limit, cursor, async (variant) => {
      const product = variant.productId ? await db.get(variant.productId) : null;
      if (!product || !(await companyExists(db, product.companyId))) {
        await db.delete(variant._id);
        counters.variantsDeleted += 1;
        return;
      }
      const label = stringOrUndefined(variant.label) ?? stringOrUndefined(variant.variantLabel);
      if (!label) {
        await db.delete(variant._id);
        counters.variantsDeleted += 1;
        return;
      }
      const minimalPatch = {
        companyId: product.companyId,
        label,
        price: product.currency
          ? numberOrUndefined(variant.price) ?? numberOrUndefined(variant.priceOverride)
          : undefined,
        variantLabel: undefined,
        attributes: undefined,
        priceOverride: undefined,
      };
      if (hasPatchChanges(variant, minimalPatch)) {
        await db.patch(variant._id, minimalPatch);
        counters.variantsUpdated += 1;
      }
    });
  }
  if (table === 'messages') {
    return processDocs(db, table, limit, cursor, async (message) => {
      if (message.companyId && (await companyExists(db, message.companyId))) {
        return;
      }
      const conversation = message.conversationId ? await db.get(message.conversationId) : null;
      if (conversation?.companyId && (await companyExists(db, conversation.companyId))) {
        await db.patch(message._id, { companyId: conversation.companyId });
        counters.messagesUpdated += 1;
        return;
      }
      await db.delete(message._id);
      counters.messagesDeleted += 1;
    });
  }
  if ((LEGACY_TABLES as readonly string[]).includes(table)) {
    return processDocs(db, table, limit, cursor, async (doc) => {
      await db.delete(doc._id);
      counters.legacyDeleted += 1;
    });
  }
  return processDocs(db, table, limit, cursor, async (doc) => {
    if (!(await companyExists(db, doc.companyId))) {
      await db.delete(doc._id);
      counters.orphanDeleted += 1;
    }
  });
};
