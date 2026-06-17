import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { refreshCompanyCatalogLanguageHintsInMutation } from './catalogLanguageHints';
import type { Id, TableNames } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

export const BATCH_SIZE = 64;

const catalogTables = [
  'embeddings',
  'productVariants',
  'productUnits',
  'productImageUploads',
  'mediaCleanupJobs',
  'products',
  'categories',
  'offers',
  'currencyRates',
] as const;

type CatalogTable = (typeof catalogTables)[number];
type CatalogClearCounts = Record<CatalogTable, number>;

const emptyCounts = (): CatalogClearCounts => ({
  categories: 0,
  currencyRates: 0,
  embeddings: 0,
  mediaCleanupJobs: 0,
  offers: 0,
  productImageUploads: 0,
  products: 0,
  productUnits: 0,
  productVariants: 0,
});

const takeIds = async <T extends TableNames>(
  documents: AsyncIterable<{ _id: Id<T> }>,
): Promise<Array<Id<T>>> => {
  const ids: Array<Id<T>> = [];
  for await (const document of documents) {
    ids.push(document._id);
    if (ids.length >= BATCH_SIZE) {
      break;
    }
  }
  return ids;
};

const deleteIds = async <T extends TableNames>(
  ctx: MutationCtx,
  ids: Array<Id<T>>,
): Promise<void> => {
  for (const id of ids) {
    await ctx.db.delete(id);
  }
};

const getBatch = async (
  ctx: MutationCtx,
  companyId: Id<'companies'>,
  table: CatalogTable,
): Promise<Array<Id<CatalogTable>>> => {
  if (table === 'offers') {
    return takeIds(ctx.db.query(table).withIndex('by_company_active', (q) => q.eq('companyId', companyId)));
  }

  return takeIds(ctx.db.query(table).withIndex('by_company', (q) => q.eq('companyId', companyId)));
};

export const clearCompanyCatalogBatch = internalMutation({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args): Promise<{
    deletedCount: number;
    done: boolean;
    table?: CatalogTable;
  }> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return { deletedCount: 0, done: true };
    }

    for (const table of catalogTables) {
      const ids = await getBatch(ctx, args.companyId, table);
      if (ids.length > 0) {
        await deleteIds(ctx, ids);
        if (table === 'products') {
          await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);
        }
        return {
          deletedCount: ids.length,
          done: false,
          table,
        };
      }
    }

    await refreshCompanyCatalogLanguageHintsInMutation(ctx, args.companyId);
    return { deletedCount: 0, done: true };
  },
});

export const clearCompanyCatalog = internalAction({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args): Promise<{
    companyId: string;
    counts: CatalogClearCounts;
  } | null> => {
    const counts = emptyCounts();

    for (;;) {
      const result = await ctx.runMutation(internal.catalogMaintenance.clearCompanyCatalogBatch, {
        companyId: args.companyId,
      });

      if (result.table) {
        counts[result.table] += result.deletedCount;
      }

      if (result.done) {
        break;
      }
    }

    const deletedSomething = Object.values(counts).some((count) => count > 0);
    if (!deletedSomething) {
      return null;
    }

    return {
      companyId: args.companyId,
      counts,
    };
  },
});
