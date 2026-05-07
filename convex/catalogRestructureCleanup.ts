import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

type LooseDoc = Record<string, unknown> & {
  _id: unknown;
  companyId?: unknown;
  productId?: unknown;
  conversationId?: unknown;
};

type DocCursor = string | undefined;

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

const normalizeNameKey = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
};

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const firstImageKey = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const image of value) {
    if (typeof image === 'string' && image.trim().length > 0) {
      return image.trim();
    }
    if (image && typeof image === 'object') {
      const record = image as Record<string, unknown>;
      const key = stringOrUndefined(record.key) ?? stringOrUndefined(record.url);
      if (key) {
        return key;
      }
    }
  }
  return undefined;
};

const getDocs = async (
  db: any,
  table: string,
  limit: number,
  cursor?: DocCursor,
): Promise<LooseDoc[]> => {
  const query = db.query(table).order('asc');
  const pagedQuery = cursor
    ? query.filter((q: any) => q.gt(q.field('_id'), cursor))
    : query;
  return pagedQuery.take(limit);
};

const processDocs = async (
  db: any,
  table: string,
  limit: number,
  processDoc: (doc: LooseDoc) => Promise<void>,
): Promise<void> => {
  let cursor: DocCursor;
  while (true) {
    const docs = await getDocs(db, table, limit, cursor);
    for (const doc of docs) {
      await processDoc(doc);
      cursor = typeof doc._id === 'string' ? doc._id : cursor;
    }
    if (docs.length < limit) {
      return;
    }
  }
};

const companyExists = async (db: any, companyId: unknown): Promise<boolean> =>
  typeof companyId === 'string' && Boolean(await db.get(companyId));

export const run = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any;
    const limit = args.limit ?? 200;
    const result = {
      productsUpdated: 0,
      productsDeleted: 0,
      variantsUpdated: 0,
      variantsDeleted: 0,
      categoriesUpdated: 0,
      messagesUpdated: 0,
      messagesDeleted: 0,
      legacyDeleted: 0,
      orphanDeleted: 0,
    };

    await processDocs(db, 'categories', limit, async (category) => {
      if (!(await companyExists(db, category.companyId))) {
        await db.delete(category._id);
        result.orphanDeleted += 1;
        return;
      }
      if (!category.nameKey) {
        const nameKey = normalizeNameKey(category.nameAr) ?? normalizeNameKey(category.nameEn);
        if (nameKey) {
          await db.patch(category._id, { nameKey });
          result.categoriesUpdated += 1;
        }
      }
    });

    await processDocs(db, 'products', limit, async (product) => {
      if (!(await companyExists(db, product.companyId))) {
        await db.delete(product._id);
        result.productsDeleted += 1;
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
      result.productsUpdated += 1;
    });

    await processDocs(db, 'productVariants', limit, async (variant) => {
      const product = variant.productId ? await db.get(variant.productId) : null;
      if (!product || !(await companyExists(db, product.companyId))) {
        await db.delete(variant._id);
        result.variantsDeleted += 1;
        return;
      }
      const label = stringOrUndefined(variant.label) ?? stringOrUndefined(variant.variantLabel);
      if (!label) {
        await db.delete(variant._id);
        result.variantsDeleted += 1;
        return;
      }
      await db.patch(variant._id, {
        companyId: product.companyId,
        label,
        price: product.currency
          ? numberOrUndefined(variant.price) ?? numberOrUndefined(variant.priceOverride)
          : undefined,
        variantLabel: undefined,
        attributes: undefined,
        priceOverride: undefined,
      });
      result.variantsUpdated += 1;
    });

    await processDocs(db, 'messages', limit, async (message) => {
      if (message.companyId && (await companyExists(db, message.companyId))) {
        return;
      }
      const conversation = message.conversationId ? await db.get(message.conversationId) : null;
      if (conversation?.companyId && (await companyExists(db, conversation.companyId))) {
        await db.patch(message._id, { companyId: conversation.companyId });
        result.messagesUpdated += 1;
        return;
      }
      await db.delete(message._id);
      result.messagesDeleted += 1;
    });

    for (const table of TENANT_TABLES) {
      await processDocs(db, table, limit, async (doc) => {
        if (!(await companyExists(db, doc.companyId))) {
          await db.delete(doc._id);
          result.orphanDeleted += 1;
        }
      });
    }

    for (const table of LEGACY_TABLES) {
      await processDocs(db, table, limit, async (doc) => {
        await db.delete(doc._id);
        result.legacyDeleted += 1;
      });
    }

    return result;
  },
});
