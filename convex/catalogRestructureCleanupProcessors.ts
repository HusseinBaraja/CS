import { processProducts } from './catalogRestructureCleanupProducts';
import {
  type CleanupDb,
  type CleanupCounters,
  type DocCursor,
  companyExists,
  deleteCleanupDoc,
  getCleanupDoc,
  hasPatchChanges,
  numberOrUndefined,
  patchCleanupDoc,
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

export const CLEANUP_TABLES = [
  'categories',
  'products',
  'productVariants',
  'messages',
  ...TENANT_TABLES,
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
  db: CleanupDb,
  table: CleanupTable,
  limit: number,
  counters: CleanupCounters,
  cursor?: DocCursor,
): Promise<{ processed: number; nextCursor: DocCursor | null; completed: boolean }> => {
  if (table === 'categories') {
    return processDocs(db, table, limit, cursor, async (category) => {
      if (!(await companyExists(db, category.companyId))) {
        await deleteCleanupDoc(db, category._id);
        counters.orphanDeleted += 1;
        return;
      }
      if (!category.nameKey) {
        const nameKey = normalizeNameKey(category.nameAr) ?? normalizeNameKey(category.nameEn);
        if (nameKey) {
          await patchCleanupDoc(db, category._id, { nameKey });
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
      const product = variant.productId ? await getCleanupDoc(db, variant.productId) : null;
      if (!product || !(await companyExists(db, product.companyId))) {
        await deleteCleanupDoc(db, variant._id);
        counters.variantsDeleted += 1;
        return;
      }
      const label = stringOrUndefined(variant.label) ?? stringOrUndefined(variant.variantLabel);
      if (!label) {
        await deleteCleanupDoc(db, variant._id);
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
        await patchCleanupDoc(db, variant._id, minimalPatch);
        counters.variantsUpdated += 1;
      }
    });
  }
  if (table === 'messages') {
    return processDocs(db, table, limit, cursor, async (message) => {
      if (message.companyId && (await companyExists(db, message.companyId))) {
        return;
      }
      const conversation = message.conversationId ? await getCleanupDoc(db, message.conversationId) : null;
      if (conversation?.companyId && (await companyExists(db, conversation.companyId))) {
        await patchCleanupDoc(db, message._id, { companyId: conversation.companyId });
        counters.messagesUpdated += 1;
        return;
      }
      const deletionMetadata = {
        originalMessageId: String(message._id),
        reason: 'missing_company',
        deletedAt: Date.now(),
      } as Record<string, string | number>;
      const optionalMetadata = {
        originalMessageCreationTime: numberOrUndefined(message._creationTime),
        originalCompanyId: stringOrUndefined(message.companyId),
        originalConversationId: stringOrUndefined(message.conversationId),
        conversationCompanyId: stringOrUndefined(conversation?.companyId),
        role: stringOrUndefined(message.role),
        timestamp: numberOrUndefined(message.timestamp),
        deliveryState: stringOrUndefined(message.deliveryState),
      };
      for (const [key, value] of Object.entries(optionalMetadata)) {
        if (value !== undefined) {
          deletionMetadata[key] = value;
        }
      }
      await db.insert('deletedMessages', {
        reason: String(deletionMetadata.reason),
        originalMessageId: String(deletionMetadata.originalMessageId),
        deletedAt: Number(deletionMetadata.deletedAt),
        originalMessageCreationTime: numberOrUndefined(deletionMetadata.originalMessageCreationTime),
        originalCompanyId: stringOrUndefined(deletionMetadata.originalCompanyId),
        originalConversationId: stringOrUndefined(deletionMetadata.originalConversationId),
        conversationCompanyId: stringOrUndefined(deletionMetadata.conversationCompanyId),
        role: stringOrUndefined(deletionMetadata.role),
        timestamp: numberOrUndefined(deletionMetadata.timestamp),
        deliveryState: stringOrUndefined(deletionMetadata.deliveryState),
      });
      await deleteCleanupDoc(db, message._id);
      counters.messagesDeleted += 1;
    });
  }
  return processDocs(db, table, limit, cursor, async (doc) => {
    if (!(await companyExists(db, doc.companyId))) {
      await deleteCleanupDoc(db, doc._id);
      counters.orphanDeleted += 1;
    }
  });
};
