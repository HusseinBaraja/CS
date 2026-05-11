export type LooseDoc = Record<string, unknown> & {
  _id: unknown;
  _creationTime: unknown;
  companyId?: unknown;
  productId?: unknown;
  conversationId?: unknown;
};

export type DocCursor = { creationTime: number; id: string } | undefined;

export type CleanupCounters = {
  productsUpdated: number;
  productsDeleted: number;
  variantsUpdated: number;
  variantsDeleted: number;
  categoriesUpdated: number;
  messagesUpdated: number;
  messagesDeleted: number;
  legacyDeleted: number;
  orphanDeleted: number;
};

export const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

export const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const firstImageKey = (value: unknown): string | undefined => {
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

export const hasPatchChanges = (doc: LooseDoc, patch: Record<string, unknown>): boolean =>
  Object.entries(patch).some(([key, value]) => {
    if (value === undefined) {
      return key in doc;
    }
    return !Object.is(doc[key], value);
  });

const getDocs = async (
  db: any,
  table: string,
  limit: number,
  cursor?: DocCursor,
): Promise<LooseDoc[]> => {
  const query = db.query(table).order('asc');
  const pagedQuery = cursor
    ? query.filter((q: any) =>
        q.or(
          q.gt(q.field('_creationTime'), cursor.creationTime),
          q.and(
            q.eq(q.field('_creationTime'), cursor.creationTime),
            q.gt(q.field('_id'), cursor.id),
          ),
        ),
      )
    : query;
  return pagedQuery.take(limit);
};

export const processDocs = async (
  db: any,
  table: string,
  limit: number,
  cursor: DocCursor,
  processDoc: (doc: LooseDoc) => Promise<void>,
): Promise<{ processed: number; nextCursor: DocCursor | null; completed: boolean }> => {
  const docs = await getDocs(db, table, limit, cursor);
  let nextCursor = cursor;
  for (const doc of docs) {
    if (typeof doc._creationTime === 'number' && typeof doc._id === 'string') {
      nextCursor = { creationTime: doc._creationTime, id: doc._id };
    }
    await processDoc(doc);
  }
  return {
    processed: docs.length,
    nextCursor: docs.length === 0 ? null : nextCursor,
    completed: docs.length < limit,
  };
};

export const companyExists = async (db: any, companyId: unknown): Promise<boolean> =>
  typeof companyId === 'string' && Boolean(await db.get(companyId));
