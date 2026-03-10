import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import {
  type CreateProductInput,
  type DeleteProductResult,
  type ListProductsFilters,
  type ProductDetailDto,
  type ProductListItemDto,
  type ProductsService,
  ProductsServiceError,
  type UpdateProductInput,
} from '../services/products';

const API_KEY = "test-api-key";

const baseProduct: ProductListItemDto = {
  id: "product-1",
  companyId: "company-1",
  categoryId: "category-1",
  nameEn: "Burger Box",
  nameAr: "علبة برجر",
  descriptionEn: "Disposable meal box",
  descriptionAr: "علبة طعام",
  specifications: {
    material: "paper",
    recyclable: true,
  },
  basePrice: 1.25,
  baseCurrency: "SAR",
  imageUrls: ["https://cdn.example.com/burger-box.jpg"],
};

const baseProductDetail: ProductDetailDto = {
  ...baseProduct,
  variants: [
    {
      id: "variant-1",
      productId: "product-1",
      variantLabel: "Large",
      attributes: {
        size: "L",
      },
      priceOverride: 1.5,
    },
  ],
};

const authHeaders = {
  "x-api-key": API_KEY,
  "content-type": "application/json",
};

const createStubProductsService = (
  overrides: Partial<ProductsService> = {},
): ProductsService => ({
  list: async () => [],
  get: async () => null,
  create: async (_companyId: string, input: CreateProductInput) => ({
    id: "product-created",
    companyId: "company-1",
    ...input,
    variants: [],
  }),
  update: async (_companyId: string, _productId: string, patch: UpdateProductInput) => ({
    ...baseProductDetail,
    categoryId: patch.categoryId ?? baseProductDetail.categoryId,
    nameEn: patch.nameEn ?? baseProductDetail.nameEn,
    nameAr: patch.nameAr === null ? undefined : patch.nameAr ?? baseProductDetail.nameAr,
    descriptionEn:
      patch.descriptionEn === null
        ? undefined
        : patch.descriptionEn ?? baseProductDetail.descriptionEn,
    descriptionAr:
      patch.descriptionAr === null
        ? undefined
        : patch.descriptionAr ?? baseProductDetail.descriptionAr,
    specifications:
      patch.specifications === null
        ? undefined
        : patch.specifications ?? baseProductDetail.specifications,
    basePrice:
      patch.basePrice === null ? undefined : patch.basePrice ?? baseProductDetail.basePrice,
    baseCurrency:
      patch.baseCurrency === null
        ? undefined
        : patch.baseCurrency ?? baseProductDetail.baseCurrency,
    imageUrls:
      patch.imageUrls === null ? undefined : patch.imageUrls ?? baseProductDetail.imageUrls,
  }),
  delete: async () => ({
    productId: "product-1",
  }),
  ...overrides,
});

const createTestApp = (productsService: ProductsService) =>
  createApp({
    productsService,
    runtimeConfig: {
      apiKey: API_KEY,
    },
  });

describe("product routes", () => {
  test("GET /api/companies/:companyId/products returns products and forwards query filters", async () => {
    let receivedFilters: ListProductsFilters | undefined;
    const app = createTestApp(createStubProductsService({
      list: async (_companyId, filters) => {
        receivedFilters = filters;
        return [baseProduct];
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products?categoryId=category-1&search=%20burger%20",
      {
        headers: {
          "x-api-key": API_KEY,
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedFilters).toEqual({
      categoryId: "category-1",
      search: "burger",
    });
    expect(body).toEqual({
      ok: true,
      products: [baseProduct],
    });
  });

  test("GET /api/companies/:companyId/products returns 404 when the company does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      list: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/products", {
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

  test("GET /api/companies/:companyId/products/:id returns the nested product payload", async () => {
    const app = createTestApp(createStubProductsService({
      get: async () => baseProductDetail,
    }));

    const response = await app.request("/api/companies/company-1/products/product-1", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      product: baseProductDetail,
    });
  });

  test("GET /api/companies/:companyId/products/:id returns 404 when the product does not exist", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request("/api/companies/company-1/products/product-1", {
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
        message: "Product not found",
      },
    });
  });

  test("POST /api/companies/:companyId/products creates a product", async () => {
    let receivedCompanyId: string | undefined;
    let receivedInput: CreateProductInput | undefined;
    const app = createTestApp(createStubProductsService({
      create: async (companyId, input) => {
        receivedCompanyId = companyId;
        receivedInput = input;

        return {
          id: "product-created",
          companyId,
          ...input,
          variants: [],
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/products", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: "  category-1  ",
        nameEn: "  Burger Box  ",
        nameAr: "  علبة برجر  ",
        descriptionEn: "  Disposable meal box  ",
        descriptionAr: "  علبة طعام  ",
        specifications: {
          material: "paper",
          recyclable: true,
        },
        basePrice: 1.25,
        baseCurrency: "  SAR  ",
        imageUrls: [" https://cdn.example.com/burger-box.jpg "],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(receivedCompanyId).toBe("company-1");
    expect(receivedInput).toEqual({
      categoryId: "category-1",
      nameEn: "Burger Box",
      nameAr: "علبة برجر",
      descriptionEn: "Disposable meal box",
      descriptionAr: "علبة طعام",
      specifications: {
        material: "paper",
        recyclable: true,
      },
      basePrice: 1.25,
      baseCurrency: "SAR",
      imageUrls: ["https://cdn.example.com/burger-box.jpg"],
    });
    expect(body).toEqual({
      ok: true,
      product: {
        id: "product-created",
        companyId: "company-1",
        categoryId: "category-1",
        nameEn: "Burger Box",
        nameAr: "علبة برجر",
        descriptionEn: "Disposable meal box",
        descriptionAr: "علبة طعام",
        specifications: {
          material: "paper",
          recyclable: true,
        },
        basePrice: 1.25,
        baseCurrency: "SAR",
        imageUrls: ["https://cdn.example.com/burger-box.jpg"],
        variants: [],
      },
    });
  });

  test("POST /api/companies/:companyId/products rejects invalid input", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request("/api/companies/company-1/products", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: "category-1",
        nameEn: "Burger Box",
        basePrice: -1,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "basePrice must be a non-negative number",
      },
    });
  });

  test("POST /api/companies/:companyId/products maps AI failures to 503", async () => {
    const app = createTestApp(createStubProductsService({
      create: async () => {
        throw new ProductsServiceError(
          ERROR_CODES.AI_PROVIDER_FAILED,
          "Gemini rate limit exceeded",
          503,
        );
      },
    }));

    const response = await app.request("/api/companies/company-1/products", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: "category-1",
        nameEn: "Burger Box",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.AI_PROVIDER_FAILED,
        message: "Gemini rate limit exceeded",
      },
    });
  });

  test("PUT /api/companies/:companyId/products/:id partially updates a product and supports clearing nullable fields", async () => {
    let receivedPatch: UpdateProductInput | undefined;
    const app = createTestApp(createStubProductsService({
      update: async (_companyId, _productId, patch) => {
        receivedPatch = patch;

        return {
          id: baseProductDetail.id,
          companyId: baseProductDetail.companyId,
          categoryId: patch.categoryId ?? baseProductDetail.categoryId,
          nameEn: patch.nameEn ?? baseProductDetail.nameEn,
          variants: baseProductDetail.variants,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/products/product-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: "  category-2  ",
        nameEn: "  Updated Burger Box  ",
        nameAr: null,
        descriptionEn: null,
        descriptionAr: null,
        specifications: null,
        basePrice: null,
        baseCurrency: null,
        imageUrls: null,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPatch).toEqual({
      categoryId: "category-2",
      nameEn: "Updated Burger Box",
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
      specifications: null,
      basePrice: null,
      baseCurrency: null,
      imageUrls: null,
    });
    expect(body).toEqual({
      ok: true,
      product: {
        id: baseProductDetail.id,
        companyId: baseProductDetail.companyId,
        categoryId: "category-2",
        nameEn: "Updated Burger Box",
        variants: baseProductDetail.variants,
      },
    });
  });

  test("PUT /api/companies/:companyId/products/:id returns 404 when the product does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      update: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/products/product-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        nameEn: "Updated Burger Box",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Product not found",
      },
    });
  });

  test("DELETE /api/companies/:companyId/products/:id returns the deleted payload", async () => {
    const deletedResult: DeleteProductResult = {
      productId: "product-1",
    };
    const app = createTestApp(createStubProductsService({
      delete: async () => deletedResult,
    }));

    const response = await app.request("/api/companies/company-1/products/product-1", {
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
});
