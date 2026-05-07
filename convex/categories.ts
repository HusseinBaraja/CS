import { v } from 'convex/values';
import type { CategoryDto, DeleteCategoryResult } from './categoriesShared';
import {
  CONFLICT_PREFIX,
  assertCategoryNameAvailable,
  createTaggedError,
  getCompany,
  getScopedCategory,
  mapCategory,
  normalizeNameKey,
  normalizeOptionalString,
} from './categoriesShared';
import { internalMutation, internalQuery } from './_generated/server';

export const list = internalQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<CategoryDto[] | null> => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return null;
    }

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    return categories
      .map(mapCategory)
      .sort((left, right) => {
        const leftName = left.nameEn ?? left.nameAr ?? '';
        const rightName = right.nameEn ?? right.nameAr ?? '';
        return leftName.localeCompare(rightName) || left.id.localeCompare(right.id);
      });
  },
});

export const get = internalQuery({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args): Promise<CategoryDto | null> => {
    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
    return category ? mapCategory(category) : null;
  },
});

export const create = internalMutation({
  args: {
    companyId: v.id("companies"),
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CategoryDto | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const nameEn = normalizeOptionalString(args.nameEn);
    const nameAr = normalizeOptionalString(args.nameAr);
    const nameKey = normalizeNameKey(nameEn, nameAr);
    const descriptionEn = normalizeOptionalString(args.descriptionEn);
    const descriptionAr = normalizeOptionalString(args.descriptionAr);

    await assertCategoryNameAvailable(ctx, args.companyId, nameKey);

    const categoryId = await ctx.db.insert("categories", {
      companyId: args.companyId,
      nameKey,
      ...(nameEn ? { nameEn } : {}),
      ...(nameAr ? { nameAr } : {}),
      ...(descriptionEn ? { descriptionEn } : {}),
      ...(descriptionAr ? { descriptionAr } : {}),
    });

    const category = await ctx.db.get(categoryId);
    if (!category) {
      throw new Error("Created category could not be loaded");
    }

    return mapCategory(category);
  },
});

export const update = internalMutation({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.union(v.string(), v.null())),
    descriptionEn: v.optional(v.union(v.string(), v.null())),
    descriptionAr: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<CategoryDto | null> => {
    const existingCategory = await getScopedCategory(ctx, args.companyId, args.categoryId);
    if (!existingCategory) {
      return null;
    }

    const patch: {
      nameEn?: string | undefined;
      nameAr?: string | undefined;
      nameKey?: string | undefined;
      descriptionEn?: string | undefined;
      descriptionAr?: string | undefined;
    } = {};

    if (args.nameEn !== undefined) {
      patch.nameEn = normalizeOptionalString(args.nameEn);
    }

    if (args.nameAr !== undefined) {
      patch.nameAr = normalizeOptionalString(args.nameAr);
    }

    if (args.nameEn !== undefined || args.nameAr !== undefined) {
      const nextNameEn = args.nameEn !== undefined ? patch.nameEn : existingCategory.nameEn;
      const nextNameAr = args.nameAr !== undefined ? patch.nameAr : existingCategory.nameAr;
      patch.nameKey = normalizeNameKey(nextNameEn, nextNameAr);
      await assertCategoryNameAvailable(ctx, args.companyId, patch.nameKey, args.categoryId);
    }

    if (args.descriptionEn !== undefined) {
      patch.descriptionEn = normalizeOptionalString(args.descriptionEn);
    }

    if (args.descriptionAr !== undefined) {
      patch.descriptionAr = normalizeOptionalString(args.descriptionAr);
    }

    await ctx.db.patch(args.categoryId, patch);

    const updatedCategory = await ctx.db.get(args.categoryId);
    if (!updatedCategory) {
      throw new Error("Updated category could not be loaded");
    }

    return mapCategory(updatedCategory);
  },
});

export const remove = internalMutation({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args): Promise<DeleteCategoryResult | null> => {
    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
    if (!category) {
      return null;
    }

    const products = await ctx.db
      .query("products")
      .withIndex("by_category", (q) =>
        q.eq("companyId", args.companyId).eq("categoryId", args.categoryId),
      )
      .take(1);

    if (products.length > 0) {
      throw createTaggedError(CONFLICT_PREFIX, "Category cannot be deleted while products exist");
    }

    await ctx.db.delete(args.categoryId);

    return {
      categoryId: args.categoryId,
    };
  },
});
