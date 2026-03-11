import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import {
  type CreateProductInput,
  type CreateProductVariantInput,
  type DeleteProductResult,
  type DeleteProductVariantResult,
  type ListProductsFilters,
  type ProductDetailDto,
  type ProductListItemDto,
  type ProductsService,
  ProductsServiceError,
  type ProductVariantDto,
  type UpdateProductInput,
  type UpdateProductVariantInput,
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
  listVariants: async () => [],
  createVariant: async (_companyId: string, productId: string, input: CreateProductVariantInput) => ({
    id: "variant-created",
    productId,
    ...input,
  }),
  updateVariant: async (_companyId: string, productId: string, variantId: string, patch: UpdateProductVariantInput) => ({
    id: variantId,
    productId,
    variantLabel: patch.variantLabel ?? "Updated Variant",
    attributes: patch.attributes ?? {
      size: "L",
    },
    ...(patch.priceOverride !== null && patch.priceOverride !== undefined
      ? { priceOverride: patch.priceOverride }
      : {}),
  }),
  deleteVariant: async (_companyId: string, productId: string, variantId: string) => ({
    productId,
    variantId,
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

  test("POST /api/companies/:companyId/products rejects malformed JSON", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request("/api/companies/company-1/products", {
      method: "POST",
      headers: authHeaders,
      body: "{",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Malformed JSON body",
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

  test("PUT /api/companies/:companyId/products/:id rejects malformed JSON", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request("/api/companies/company-1/products/product-1", {
      method: "PUT",
      headers: authHeaders,
      body: "{",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Malformed JSON body",
      },
    });
  });

  test("PUT /api/companies/:companyId/products/:id returns 409 for concurrent update conflicts", async () => {
    const app = createTestApp(createStubProductsService({
      update: async () => {
        throw new ProductsServiceError(
          ERROR_CODES.CONFLICT,
          "Product was modified concurrently; retry the update",
          409,
        );
      },
    }));

    const response = await app.request("/api/companies/company-1/products/product-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        nameEn: "Updated Burger Box",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: "Product was modified concurrently; retry the update",
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

  test("GET /api/companies/:companyId/products/:productId/variants returns the stored variants", async () => {
    let receivedCompanyId: string | undefined;
    let receivedProductId: string | undefined;
    const variants: ProductVariantDto[] = [
      {
        id: "variant-2",
        productId: "product-1",
        variantLabel: "Medium",
        attributes: {
          size: "M",
          options: ["white", "kraft"],
        },
        priceOverride: 1.4,
      },
      baseProductDetail.variants[0]!,
    ];
    const app = createTestApp(createStubProductsService({
      listVariants: async (companyId, productId) => {
        receivedCompanyId = companyId;
        receivedProductId = productId;
        return variants;
      },
    }));

    const response = await app.request("/api/companies/company-1/products/product-1/variants", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedCompanyId).toBe("company-1");
    expect(receivedProductId).toBe("product-1");
    expect(body).toEqual({
      ok: true,
      variants,
    });
  });

  test("GET /api/companies/:companyId/products/:productId/variants returns 404 when the product does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      listVariants: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/products/product-1/variants", {
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

  test("POST /api/companies/:companyId/products/:productId/variants creates a variant with recursive attributes", async () => {
    let receivedCompanyId: string | undefined;
    let receivedProductId: string | undefined;
    let receivedInput: CreateProductVariantInput | undefined;
    const app = createTestApp(createStubProductsService({
      createVariant: async (companyId, productId, input) => {
        receivedCompanyId = companyId;
        receivedProductId = productId;
        receivedInput = input;

        return {
          id: "variant-created",
          productId,
          ...input,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/products/product-1/variants", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        variantLabel: "  Family Pack  ",
        attributes: {
          " size ": "XL",
          nested: {
            " display ": "front",
            tags: ["sale", null, 2, { " tone ": "warm" }],
          },
        },
        priceOverride: 2.25,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(receivedCompanyId).toBe("company-1");
    expect(receivedProductId).toBe("product-1");
    expect(receivedInput).toEqual({
      variantLabel: "Family Pack",
      attributes: {
        size: "XL",
        nested: {
          display: "front",
          tags: ["sale", null, 2, { tone: "warm" }],
        },
      },
      priceOverride: 2.25,
    });
    expect(body).toEqual({
      ok: true,
      variant: {
        id: "variant-created",
        productId: "product-1",
        variantLabel: "Family Pack",
        attributes: {
          size: "XL",
          nested: {
            display: "front",
            tags: ["sale", null, 2, { tone: "warm" }],
          },
        },
        priceOverride: 2.25,
      },
    });
  });

  test("POST /api/companies/:companyId/products/:productId/variants returns 404 when the parent product does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      createVariant: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/products/product-1/variants", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        variantLabel: "Large",
        attributes: {
          size: "L",
        },
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

  test("POST /api/companies/:companyId/products/:productId/variants rejects invalid recursive attributes", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request("/api/companies/company-1/products/product-1/variants", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        variantLabel: "Large",
        attributes: ["invalid"],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "attributes must be an object",
      },
    });
  });

  test("POST /api/companies/:companyId/products/:productId/variants rejects malformed JSON", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request("/api/companies/company-1/products/product-1/variants", {
      method: "POST",
      headers: authHeaders,
      body: "{",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Malformed JSON body",
      },
    });
  });

  test("POST /api/companies/:companyId/products/:productId/variants returns 409 for concurrent update conflicts", async () => {
    const app = createTestApp(createStubProductsService({
      createVariant: async () => {
        throw new ProductsServiceError(
          ERROR_CODES.CONFLICT,
          "Product was modified concurrently; retry the update",
          409,
        );
      },
    }));

    const response = await app.request("/api/companies/company-1/products/product-1/variants", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        variantLabel: "Large",
        attributes: {
          size: "L",
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: "Product was modified concurrently; retry the update",
      },
    });
  });

  test("PUT /api/companies/:companyId/products/:productId/variants/:variantId updates a variant and clears nullable priceOverride", async () => {
    let receivedPatch: UpdateProductVariantInput | undefined;
    const app = createTestApp(createStubProductsService({
      updateVariant: async (_companyId, productId, variantId, patch) => {
        receivedPatch = patch;

        return {
          id: variantId,
          productId,
          variantLabel: patch.variantLabel ?? "Large",
          attributes: patch.attributes ?? {
            size: "L",
          },
        };
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          variantLabel: "  Extra Large  ",
          attributes: {
            " size ": "XL",
            nested: {
              finish: ["matte", "gloss"],
            },
          },
          priceOverride: null,
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPatch).toEqual({
      variantLabel: "Extra Large",
      attributes: {
        size: "XL",
        nested: {
          finish: ["matte", "gloss"],
        },
      },
      priceOverride: null,
    });
    expect(body).toEqual({
      ok: true,
      variant: {
        id: "variant-1",
        productId: "product-1",
        variantLabel: "Extra Large",
        attributes: {
          size: "XL",
          nested: {
            finish: ["matte", "gloss"],
          },
        },
      },
    });
  });

  test("PUT /api/companies/:companyId/products/:productId/variants/:variantId returns 404 when the parent product does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      updateVariant: async () => null,
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          variantLabel: "Large",
        }),
      },
    );
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

  test("PUT /api/companies/:companyId/products/:productId/variants/:variantId returns 404 when the variant does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      updateVariant: async () => {
        throw new ProductsServiceError(ERROR_CODES.NOT_FOUND, "Variant not found", 404);
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          variantLabel: "Large",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Variant not found",
      },
    });
  });

  test("PUT /api/companies/:companyId/products/:productId/variants/:variantId rejects an empty body", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({}),
      },
    );
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

  test("PUT /api/companies/:companyId/products/:productId/variants/:variantId rejects invalid recursive attributes", async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          attributes: {
            nested: {
              "  ": "bad",
            },
          },
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "attributes.nested keys must be non-empty strings",
      },
    });
  });

  test("PUT /api/companies/:companyId/products/:productId/variants/:variantId returns 409 for concurrent update conflicts", async () => {
    const app = createTestApp(createStubProductsService({
      updateVariant: async () => {
        throw new ProductsServiceError(
          ERROR_CODES.CONFLICT,
          "Product was modified concurrently; retry the update",
          409,
        );
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          variantLabel: "Large",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: "Product was modified concurrently; retry the update",
      },
    });
  });

  test("DELETE /api/companies/:companyId/products/:productId/variants/:variantId returns the deleted payload", async () => {
    const deletedResult: DeleteProductVariantResult = {
      productId: "product-1",
      variantId: "variant-1",
    };
    const app = createTestApp(createStubProductsService({
      deleteVariant: async () => deletedResult,
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "DELETE",
        headers: {
          "x-api-key": API_KEY,
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      deleted: deletedResult,
    });
  });

  test("DELETE /api/companies/:companyId/products/:productId/variants/:variantId returns 404 when the parent product does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      deleteVariant: async () => null,
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "DELETE",
        headers: {
          "x-api-key": API_KEY,
        },
      },
    );
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

  test("DELETE /api/companies/:companyId/products/:productId/variants/:variantId returns 404 when the variant does not exist", async () => {
    const app = createTestApp(createStubProductsService({
      deleteVariant: async () => {
        throw new ProductsServiceError(ERROR_CODES.NOT_FOUND, "Variant not found", 404);
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "DELETE",
        headers: {
          "x-api-key": API_KEY,
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Variant not found",
      },
    });
  });

  test("DELETE /api/companies/:companyId/products/:productId/variants/:variantId returns 409 for concurrent update conflicts", async () => {
    const app = createTestApp(createStubProductsService({
      deleteVariant: async () => {
        throw new ProductsServiceError(
          ERROR_CODES.CONFLICT,
          "Product was modified concurrently; retry the update",
          409,
        );
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/variants/variant-1",
      {
        method: "DELETE",
        headers: {
          "x-api-key": API_KEY,
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: "Product was modified concurrently; retry the update",
      },
    });
  });
});
