import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

type LooseDoc = Record<string, unknown> & {
  _id: unknown;
  companyId?: unknown;
  productId?: unknown;
  conversationId?: unknown;
};

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

const getDocs = async (db: any, table: string, limit: number): Promise<LooseDoc[]> =>
  db.query(table).take(limit);

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

    for (const category of await getDocs(db, 'categories', limit)) {
      if (!(await companyExists(db, category.companyId))) {
        await db.delete(category._id);
        result.orphanDeleted += 1;
        continue;
      }
      if (!category.nameKey) {
        const nameKey = normalizeNameKey(category.nameAr) ?? normalizeNameKey(category.nameEn);
        if (nameKey) {
          await db.patch(category._id, { nameKey });
          result.categoriesUpdated += 1;
        }
      }
    }

    for (const product of await getDocs(db, 'products', limit)) {
      if (!(await companyExists(db, product.companyId))) {
        await db.delete(product._id);
        result.productsDeleted += 1;
        continue;
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
    }

    for (const variant of await getDocs(db, 'productVariants', limit)) {
      const product = variant.productId ? await db.get(variant.productId) : null;
      if (!product || !(await companyExists(db, product.companyId))) {
        await db.delete(variant._id);
        result.variantsDeleted += 1;
        continue;
      }
      const label = stringOrUndefined(variant.label) ?? stringOrUndefined(variant.variantLabel);
      if (!label) {
        await db.delete(variant._id);
        result.variantsDeleted += 1;
        continue;
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
    }

    for (const message of await getDocs(db, 'messages', limit)) {
      if (message.companyId && (await companyExists(db, message.companyId))) {
        continue;
      }
      const conversation = message.conversationId ? await db.get(message.conversationId) : null;
      if (conversation?.companyId && (await companyExists(db, conversation.companyId))) {
        await db.patch(message._id, { companyId: conversation.companyId });
        result.messagesUpdated += 1;
        continue;
      }
      await db.delete(message._id);
      result.messagesDeleted += 1;
    }

    for (const table of TENANT_TABLES) {
      for (const doc of await getDocs(db, table, limit)) {
        if (!(await companyExists(db, doc.companyId))) {
          await db.delete(doc._id);
          result.orphanDeleted += 1;
        }
      }
    }

    for (const table of LEGACY_TABLES) {
      for (const doc of await getDocs(db, table, limit)) {
        await db.delete(doc._id);
        result.legacyDeleted += 1;
      }
    }

    return result;
  },
});
