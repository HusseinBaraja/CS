/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { createCompany, createDeletedCompany } from './testFixtures';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("convex categories", () => {
  it("lists only categories for the requested company sorted by name and id", async () => {
    const t = convexTest(schema, modules);

    const { companyId, bagsCategoryId, firstContainersCategoryId, secondContainersCategoryId } = await t.run(async (ctx) => {
      const { companyId } = await createCompany(ctx, {
        name: "Tenant One",
      });
      const { companyId: otherCompanyId } = await createCompany(ctx, {
        name: "Tenant Two",
      });

      const bagsCategoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Bags",
      });
      const firstContainersCategoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const secondContainersCategoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
        descriptionEn: "Same name, different id",
      });
      await ctx.db.insert("categories", {
        companyId: otherCompanyId,
        nameEn: "Ignored",
      });

      return {
        bagsCategoryId,
        companyId,
        firstContainersCategoryId,
        secondContainersCategoryId,
      };
    });

    const categories = await t.query(internal.categories.list, {
      companyId,
    });

    expect(categories).toHaveLength(3);
    expect(categories?.map((category: { nameEn?: string }) => category.nameEn)).toEqual([
      "Bags",
      "Containers",
      "Containers",
    ]);
    expect(categories?.map((category: { id: string }) => category.id)).toEqual([
      bagsCategoryId,
      ...[firstContainersCategoryId, secondContainersCategoryId].sort((left, right) =>
        left.localeCompare(right),
      ),
    ]);
    expect(categories?.every((category: { companyId: string }) => category.companyId === companyId)).toBe(true);
  });

  it("returns null when listing a missing company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      createDeletedCompany(ctx, {
        name: "Missing Soon",
      }).then(({ companyId }) => companyId),
    );

    const categories = await t.query(internal.categories.list, {
      companyId,
    });

    expect(categories).toBeNull();
  });

  it("gets a scoped category and hides categories from other companies", async () => {
    const t = convexTest(schema, modules);

    const { companyId, categoryId, otherCompanyId } = await t.run(async (ctx) => {
      const { companyId } = await createCompany(ctx, {
        name: "Tenant One",
      });
      const { companyId: otherCompanyId } = await createCompany(ctx, {
        name: "Tenant Two",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
        nameAr: "حاويات",
      });

      return {
        companyId,
        categoryId,
        otherCompanyId,
      };
    });

    const category = await t.query(internal.categories.get, {
      companyId,
      categoryId,
    });
    const hiddenCategory = await t.query(internal.categories.get, {
      companyId: otherCompanyId,
      categoryId,
    });

    expect(category).toEqual({
      id: categoryId,
      companyId,
      nameEn: "Containers",
      nameAr: "حاويات",
    });
    expect(hiddenCategory).toBeNull();
  });

  it("creates a category, trims strings, and preserves optional fields", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      createCompany(ctx, {
        name: "Tenant",
      }).then(({ companyId }) => companyId),
    );

    const category = await t.mutation(internal.categories.create, {
      companyId,
      nameEn: "  Containers  ",
      nameAr: "  حاويات  ",
      descriptionEn: "  English description  ",
      descriptionAr: "  وصف عربي  ",
    });

    expect(category).toEqual({
      id: category?.id,
      companyId,
      nameEn: "Containers",
      nameAr: "حاويات",
      descriptionEn: "English description",
      descriptionAr: "وصف عربي",
    });
  });

  it("returns null when creating for a missing company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      createDeletedCompany(ctx, {
        name: "Deleted Tenant",
      }).then(({ companyId }) => companyId),
    );

    const category = await t.mutation(internal.categories.create, {
      companyId,
      nameEn: "Containers",
    });

    expect(category).toBeNull();
  });

  it("rejects duplicate category names within the same company and allows them across companies", async () => {
    const t = convexTest(schema, modules);

    const { companyId, otherCompanyId } = await t.run(async (ctx) => {
      const { companyId } = await createCompany(ctx, {
        name: "Tenant One",
      });
      const { companyId: otherCompanyId } = await createCompany(ctx, {
        name: "Tenant Two",
      });

      await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });

      return {
        companyId,
        otherCompanyId,
      };
    });

    await expect(
      t.mutation(internal.categories.create, {
        companyId,
        nameEn: "  Containers  ",
      }),
    ).rejects.toThrow("CONFLICT: Category name already exists for this company");

    const category = await t.mutation(internal.categories.create, {
      companyId: otherCompanyId,
      nameEn: "Containers",
    });

    expect(category?.companyId).toBe(otherCompanyId);
    expect(category?.nameEn).toBe("Containers");
  });

  it("updates a category, clears nullable fields, and rejects sibling duplicates", async () => {
    const t = convexTest(schema, modules);

    const { companyId, categoryId, duplicateCategoryId } = await t.run(async (ctx) => {
      const { companyId } = await createCompany(ctx, {
        name: "Tenant",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
        nameAr: "حاويات",
        descriptionEn: "Original description",
      });
      const duplicateCategoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Cups",
      });

      return {
        companyId,
        categoryId,
        duplicateCategoryId,
      };
    });

    const updatedCategory = await t.mutation(internal.categories.update, {
      companyId,
      categoryId,
      nameAr: null,
      descriptionEn: null,
      descriptionAr: "  وصف محدث  ",
    });
    const storedCategory = await t.run(async (ctx) => ctx.db.get(categoryId));

    expect(updatedCategory).toEqual({
      id: categoryId,
      companyId,
      nameEn: "Containers",
      descriptionAr: "وصف محدث",
    });
    expect(storedCategory).toEqual({
      _id: categoryId,
      _creationTime: expect.any(Number),
      companyId,
      nameEn: "Containers",
      nameKey: "containers",
      descriptionAr: "وصف محدث",
    });

    await expect(
      t.mutation(internal.categories.update, {
        companyId,
        categoryId: duplicateCategoryId,
        nameEn: " Containers ",
      }),
    ).rejects.toThrow("CONFLICT: Category name already exists for this company");
  });

  it("returns null when updating a category outside the company scope", async () => {
    const t = convexTest(schema, modules);

    const { otherCompanyId, categoryId } = await t.run(async (ctx) => {
      const { companyId } = await createCompany(ctx, {
        name: "Tenant One",
      });
      const { companyId: otherCompanyId } = await createCompany(ctx, {
        name: "Tenant Two",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });

      return {
        otherCompanyId,
        categoryId,
      };
    });

    const updatedCategory = await t.mutation(internal.categories.update, {
      companyId: otherCompanyId,
      categoryId,
      nameEn: "Renamed",
    });

    expect(updatedCategory).toBeNull();
  });

  it("deletes an empty category", async () => {
    const t = convexTest(schema, modules);

    const { companyId, categoryId } = await t.run(async (ctx) => {
      const { companyId } = await createCompany(ctx, {
        name: "Tenant",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });

      return {
        companyId,
        categoryId,
      };
    });

    const result = await t.mutation(internal.categories.remove, {
      companyId,
      categoryId,
    });
    const deletedCategory = await t.run(async (ctx) => ctx.db.get(categoryId));

    expect(result).toEqual({
      categoryId,
    });
    expect(deletedCategory).toBeNull();
  });

  it("rejects deletion when products exist and returns null for out-of-scope deletes", async () => {
    const t = convexTest(schema, modules);

    const { companyId, otherCompanyId, categoryId } = await t.run(async (ctx) => {
      const { companyId } = await createCompany(ctx, {
        name: "Tenant One",
      });
      const { companyId: otherCompanyId } = await createCompany(ctx, {
        name: "Tenant Two",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });

      await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });

      return {
        companyId,
        otherCompanyId,
        categoryId,
      };
    });

    await expect(
      t.mutation(internal.categories.remove, {
        companyId,
        categoryId,
      }),
    ).rejects.toThrow("CONFLICT: Category cannot be deleted while products exist");
    const storedCategoryAfterConflict = await t.run(async (ctx) => ctx.db.get(categoryId));

    const missingDelete = await t.mutation(internal.categories.remove, {
      companyId: otherCompanyId,
      categoryId,
    });
    const storedCategoryAfterOutOfScopeDelete = await t.run(async (ctx) => ctx.db.get(categoryId));

    expect(storedCategoryAfterConflict).toEqual({
      _id: categoryId,
      _creationTime: expect.any(Number),
      companyId,
      nameEn: "Containers",
    });
    expect(missingDelete).toBeNull();
    expect(storedCategoryAfterOutOfScopeDelete).toEqual(storedCategoryAfterConflict);
  });
});

