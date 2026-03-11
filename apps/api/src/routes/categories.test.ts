import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import {
  type CategoriesService,
  CategoriesServiceError,
  type CategoryDto,
  type CreateCategoryInput,
  type DeleteCategoryResult,
  type UpdateCategoryInput,
} from '../services/categories';

const API_KEY = "test-api-key";

const baseCategory: CategoryDto = {
  id: "category-1",
  companyId: "company-1",
  nameEn: "Containers",
  nameAr: "حاويات",
  descriptionEn: "Food packaging",
  descriptionAr: "تغليف طعام",
};

const authHeaders = {
  "x-api-key": API_KEY,
  "content-type": "application/json",
};

const createStubCategoriesService = (
  overrides: Partial<CategoriesService> = {},
): CategoriesService => ({
  list: async () => [],
  get: async () => null,
  create: async (_companyId: string, input: CreateCategoryInput) => ({
    id: "category-created",
    companyId: "company-1",
    ...input,
  }),
  update: async (companyId: string, _categoryId: string, patch: UpdateCategoryInput) => ({
    ...baseCategory,
    companyId,
    ...patch,
    nameAr: patch.nameAr === null ? undefined : patch.nameAr ?? baseCategory.nameAr,
    descriptionEn:
      patch.descriptionEn === null ? undefined : patch.descriptionEn ?? baseCategory.descriptionEn,
    descriptionAr:
      patch.descriptionAr === null ? undefined : patch.descriptionAr ?? baseCategory.descriptionAr,
  }),
  delete: async (companyId: string, categoryId: string) => ({
    categoryId: categoryId || `${companyId}-deleted`,
  }),
  ...overrides,
});

const createTestApp = (categoriesService: CategoriesService) =>
  createApp({
    categoriesService,
    runtimeConfig: {
      apiKey: API_KEY,
    },
  });

describe("category routes", () => {
  test("GET /api/companies/:companyId/categories returns the categories payload", async () => {
    const app = createTestApp(createStubCategoriesService({
      list: async () => [
        baseCategory,
        {
          id: "category-2",
          companyId: "company-1",
          nameEn: "Cups",
        },
      ],
    }));

    const response = await app.request("/api/companies/company-1/categories", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      categories: [
        baseCategory,
        {
          id: "category-2",
          companyId: "company-1",
          nameEn: "Cups",
        },
      ],
    });
  });

  test("GET /api/companies/:companyId/categories returns 404 when the company does not exist", async () => {
    const app = createTestApp(createStubCategoriesService({
      list: async () => null,
    }));

    const response = await app.request("/api/companies/missing-company/categories", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Company not found",
      },
    });
  });

  test("GET /api/companies/:companyId/categories/:id returns the category payload", async () => {
    let receivedCompanyId: string | undefined;
    let receivedCategoryId: string | undefined;
    const app = createTestApp(createStubCategoriesService({
      get: async (companyId, categoryId) => {
        receivedCompanyId = companyId;
        receivedCategoryId = categoryId;

        return {
          ...baseCategory,
          companyId,
          id: categoryId,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/categories/existing-category", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedCompanyId).toBe("company-1");
    expect(receivedCategoryId).toBe("existing-category");
    expect(body).toEqual({
      ok: true,
      category: {
        ...baseCategory,
        companyId: "company-1",
        id: "existing-category",
      },
    });
  });

  test("GET /api/companies/:companyId/categories/:id returns 404 when the category does not exist", async () => {
    const app = createTestApp(createStubCategoriesService());

    const response = await app.request("/api/companies/company-1/categories/missing-category", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Category not found",
      },
    });
  });

  test("POST /api/companies/:companyId/categories creates a category", async () => {
    let receivedCompanyId: string | undefined;
    let receivedInput: CreateCategoryInput | undefined;
    const app = createTestApp(createStubCategoriesService({
      create: async (companyId, input) => {
        receivedCompanyId = companyId;
        receivedInput = input;
        return {
          id: "category-created",
          companyId,
          ...input,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/categories", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        nameEn: "  New Category  ",
        nameAr: "  تصنيف جديد  ",
        descriptionEn: "  English description  ",
        descriptionAr: "  وصف عربي  ",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(receivedCompanyId).toBe("company-1");
    expect(receivedInput).toEqual({
      nameEn: "New Category",
      nameAr: "تصنيف جديد",
      descriptionEn: "English description",
      descriptionAr: "وصف عربي",
    });
    expect(body).toEqual({
      ok: true,
      category: {
        id: "category-created",
        companyId: "company-1",
        nameEn: "New Category",
        nameAr: "تصنيف جديد",
        descriptionEn: "English description",
        descriptionAr: "وصف عربي",
      },
    });
  });

  test("POST /api/companies/:companyId/categories rejects invalid input", async () => {
    const app = createTestApp(createStubCategoriesService());

    const response = await app.request("/api/companies/company-1/categories", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        nameEn: "Containers",
        descriptionEn: "",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "descriptionEn is required when provided",
      },
    });
  });

  test("POST /api/companies/:companyId/categories maps duplicate name conflicts to 409", async () => {
    const app = createTestApp(createStubCategoriesService({
      create: async () => {
        throw new CategoriesServiceError(
          ERROR_CODES.CONFLICT,
          "Category name already exists for this company",
          409,
        );
      },
    }));

    const response = await app.request("/api/companies/company-1/categories", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        nameEn: "Containers",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: "Category name already exists for this company",
      },
    });
  });

  test("PUT /api/companies/:companyId/categories/:id partially updates a category", async () => {
    let receivedPatch: UpdateCategoryInput | undefined;
    const app = createTestApp(createStubCategoriesService({
      update: async (_companyId, _categoryId, patch) => {
        receivedPatch = patch;
        return {
          ...baseCategory,
          nameEn: patch.nameEn ?? baseCategory.nameEn,
          nameAr: patch.nameAr === null ? undefined : patch.nameAr ?? baseCategory.nameAr,
          descriptionEn:
            patch.descriptionEn === null
              ? undefined
              : patch.descriptionEn ?? baseCategory.descriptionEn,
          descriptionAr:
            patch.descriptionAr === null
              ? undefined
              : patch.descriptionAr ?? baseCategory.descriptionAr,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/categories/category-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        nameEn: "  Updated Category  ",
        descriptionEn: "  Updated description  ",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPatch).toEqual({
      nameEn: "Updated Category",
      descriptionEn: "Updated description",
    });
    expect(body).toEqual({
      ok: true,
      category: {
        ...baseCategory,
        nameEn: "Updated Category",
        descriptionEn: "Updated description",
      },
    });
  });

  test("PUT /api/companies/:companyId/categories/:id clears optional fields when null is provided", async () => {
    let receivedPatch: UpdateCategoryInput | undefined;
    const app = createTestApp(createStubCategoriesService({
      update: async (_companyId, _categoryId, patch) => {
        receivedPatch = patch;
        return {
          id: baseCategory.id,
          companyId: baseCategory.companyId,
          nameEn: baseCategory.nameEn,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/categories/category-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        nameAr: null,
        descriptionEn: null,
        descriptionAr: null,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPatch).toEqual({
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
    });
    expect(body).toEqual({
      ok: true,
      category: {
        id: baseCategory.id,
        companyId: baseCategory.companyId,
        nameEn: baseCategory.nameEn,
      },
    });
  });

  test("PUT /api/companies/:companyId/categories/:id rejects empty bodies", async () => {
    const app = createTestApp(createStubCategoriesService());

    const response = await app.request("/api/companies/company-1/categories/category-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Request body must include at least one updatable field",
      },
    });
  });

  test("DELETE /api/companies/:companyId/categories/:id returns the deleted payload", async () => {
    const deletedResult: DeleteCategoryResult = {
      categoryId: "category-1",
    };
    const app = createTestApp(createStubCategoriesService({
      delete: async () => deletedResult,
    }));

    const response = await app.request("/api/companies/company-1/categories/category-1", {
      method: "DELETE",
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      deleted: deletedResult,
    });
  });

  test("DELETE /api/companies/:companyId/categories/:id returns 409 when products exist", async () => {
    const app = createTestApp(createStubCategoriesService({
      delete: async () => {
        throw new CategoriesServiceError(
          ERROR_CODES.CONFLICT,
          "Category cannot be deleted while products exist",
          409,
        );
      },
    }));

    const response = await app.request("/api/companies/company-1/categories/category-1", {
      method: "DELETE",
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: "Category cannot be deleted while products exist",
      },
    });
  });

  test("DELETE /api/companies/:companyId/categories/:id returns 404 when the category does not exist", async () => {
    const app = createTestApp(createStubCategoriesService({
      delete: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/categories/category-1", {
      method: "DELETE",
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Category not found",
      },
    });
  });
});
