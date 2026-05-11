import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import {
  CLEANUP_TABLES,
  type CleanupTable,
  type DocCursor,
  normalizeBatchLimit,
  processCleanupTable,
} from './catalogRestructureCleanupProcessors';

export const run = internalMutation({
  args: {
    limit: v.optional(v.number()),
    table: v.optional(v.string()),
    cursor: v.optional(
      v.object({
        creationTime: v.number(),
        id: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any;
    const limit = normalizeBatchLimit(args.limit);
    const startTable = args.table ?? CLEANUP_TABLES[0];
    const startIndex = CLEANUP_TABLES.indexOf(startTable as CleanupTable);
    if (startIndex < 0) {
      throw new Error(`unknown cleanup table: ${startTable}`);
    }

    let remaining = limit;
    const result = {
      processed: 0,
      nextTable: null as string | null,
      nextCursor: null as DocCursor | null,
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

    for (let index = startIndex; index < CLEANUP_TABLES.length && remaining > 0; index += 1) {
      const table = CLEANUP_TABLES[index];
      const batch = await processCleanupTable(
        db,
        table,
        remaining,
        result,
        index === startIndex ? args.cursor : undefined,
      );
      result.processed += batch.processed;
      remaining -= batch.processed;
      if (!batch.completed) {
        result.nextTable = table;
        result.nextCursor = batch.nextCursor;
        return result;
      }
      if (remaining === 0 && index + 1 < CLEANUP_TABLES.length) {
        result.nextTable = CLEANUP_TABLES[index + 1];
        result.nextCursor = null;
        return result;
      }
    }

    return result;
  },
});
