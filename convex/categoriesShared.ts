import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

export type CategoryDto = {
  id: string;
  companyId: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
};

export type DeleteCategoryResult = {
  categoryId: string;
};

export const CONFLICT_PREFIX = 'CONFLICT';
export const VALIDATION_PREFIX = 'VALIDATION_FAILED';

export const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

export const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const normalizeNameKey = (nameEn: string | undefined, nameAr: string | undefined): string => {
  const selectedName = nameAr ?? nameEn;
  if (!selectedName) {
    throw createTaggedError(VALIDATION_PREFIX, 'at least one of nameEn or nameAr is required');
  }

  return selectedName.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
};

export const mapCategory = (category: Doc<'categories'>): CategoryDto => ({
  id: category._id,
  companyId: category.companyId,
  ...(category.nameEn ? { nameEn: category.nameEn } : {}),
  ...(category.nameAr ? { nameAr: category.nameAr } : {}),
  ...(category.descriptionEn ? { descriptionEn: category.descriptionEn } : {}),
  ...(category.descriptionAr ? { descriptionAr: category.descriptionAr } : {}),
});

type CategoryReader = {
  db: Pick<MutationCtx['db'], 'get' | 'query'>;
};

export const getCompany = async (
  ctx: CategoryReader,
  companyId: Id<'companies'>,
) => ctx.db.get(companyId);

export const getScopedCategory = async (
  ctx: CategoryReader,
  companyId: Id<'companies'>,
  categoryId: Id<'categories'>,
): Promise<Doc<'categories'> | null> => {
  const category = await ctx.db.get(categoryId);
  if (!category || category.companyId !== companyId) {
    return null;
  }

  return category;
};

export const assertCategoryNameAvailable = async (
  ctx: MutationCtx,
  companyId: Id<'companies'>,
  nameKey: string,
  categoryId?: Id<'categories'>,
): Promise<void> => {
  const existingCategories = await ctx.db
    .query('categories')
    .withIndex('by_company', (q) => q.eq('companyId', companyId))
    .collect();

  const conflictingCategory = existingCategories.find((category) => {
    if (category._id === categoryId) {
      return false;
    }

    const existingKey = category.nameKey ?? normalizeNameKey(category.nameEn, category.nameAr);
    return existingKey === nameKey;
  });
  if (conflictingCategory) {
    throw createTaggedError(CONFLICT_PREFIX, 'Category name already exists for this company');
  }
};
