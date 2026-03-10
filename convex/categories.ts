import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query } from './_generated/server';

type CategoryDto = {
  id: string;
  companyId: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
};

type DeleteCategoryResult = {
  categoryId: string;
};

const CONFLICT_PREFIX = "CONFLICT";
const VALIDATION_PREFIX = "VALIDATION_FAILED";

const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

const normalizeRequiredString = (value: string, fieldName: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} is required`);
  }

  return normalized;
};

const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const mapCategory = (category: Doc<"categories">): CategoryDto => ({
  id: category._id,
  companyId: category.companyId,
  nameEn: category.nameEn,
  ...(category.nameAr ? { nameAr: category.nameAr } : {}),
  ...(category.descriptionEn ? { descriptionEn: category.descriptionEn } : {}),
  ...(category.descriptionAr ? { descriptionAr: category.descriptionAr } : {}),
});

type CategoryReader = {
  db: Pick<MutationCtx["db"], "get" | "query">;
};

const getCompany = async (
  ctx: CategoryReader,
  companyId: Id<"companies">,
) => ctx.db.get(companyId);

const getScopedCategory = async (
  ctx: CategoryReader,
  companyId: Id<"companies">,
  categoryId: Id<"categories">,
): Promise<Doc<"categories"> | null> => {
  const category = await ctx.db.get(categoryId);
  if (!category || category.companyId !== companyId) {
    return null;
  }

  return category;
};

const assertCategoryNameAvailable = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
  nameEn: string,
  categoryId?: Id<"categories">,
): Promise<void> => {
  const existingCategories = await ctx.db
    .query("categories")
    .withIndex("by_company_name_en", (q) =>
      q.eq("companyId", companyId).eq("nameEn", nameEn),
    )
    .collect();

  const conflictingCategory = existingCategories.find((category) => category._id !== categoryId);
  if (conflictingCategory) {
    throw createTaggedError(CONFLICT_PREFIX, "Category name already exists for this company");
  }
};

export const list = query({
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
      .sort((left, right) => left.nameEn.localeCompare(right.nameEn) || left.id.localeCompare(right.id));
  },
});

export const get = query({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args): Promise<CategoryDto | null> => {
    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
    return category ? mapCategory(category) : null;
  },
});

export const create = mutation({
  args: {
    companyId: v.id("companies"),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CategoryDto | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const nameEn = normalizeRequiredString(args.nameEn, "nameEn");
    const nameAr = normalizeOptionalString(args.nameAr);
    const descriptionEn = normalizeOptionalString(args.descriptionEn);
    const descriptionAr = normalizeOptionalString(args.descriptionAr);

    await assertCategoryNameAvailable(ctx, args.companyId, nameEn);

    const categoryId = await ctx.db.insert("categories", {
      companyId: args.companyId,
      nameEn,
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

export const update = mutation({
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
      nameEn?: string;
      nameAr?: string | undefined;
      descriptionEn?: string | undefined;
      descriptionAr?: string | undefined;
    } = {};

    if (args.nameEn !== undefined) {
      patch.nameEn = normalizeRequiredString(args.nameEn, "nameEn");
      await assertCategoryNameAvailable(ctx, args.companyId, patch.nameEn, args.categoryId);
    }

    if (args.nameAr !== undefined) {
      patch.nameAr = normalizeOptionalString(args.nameAr);
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

export const remove = mutation({
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
