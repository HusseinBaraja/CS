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
  type ProductImageDto,
  type ProductListItemDto,
  type ProductsService,
  ProductsServiceError,
  type ProductVariantDto,
  type UpdateProductInput,
  type UpdateProductVariantInput,
} from '../services/products';
import {
  type CreateProductImageUploadInput,
  type DeleteProductImageResult,
  ProductMediaServiceError,
  type ProductMediaService,
} from '../services/productMedia';

const API_KEY = "test-api-key";

const baseImage: ProductImageDto = {
  id: "image-1",
  key: "companies/company-1/products/product-1/image-1.jpg",
  contentType: "image/jpeg",
  sizeBytes: 1024,
  etag: '"etag-1"',
  alt: "Front view",
  uploadedAt: Date.UTC(2026, 2, 12, 0, 0, 0),
  downloadUrl: "https://signed.example/download",
  downloadUrlExpiresAt: "2026-03-12T00:15:00.000Z",
};

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
  images: [baseImage],
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
    images: [],
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

const createStubProductMediaService = (
  overrides: Partial<ProductMediaService> = {},
): ProductMediaService => ({
  createUpload: async (_companyId: string, _productId: string, input: CreateProductImageUploadInput) => ({
    uploadId: "upload-1",
    imageId: "image-2",
    objectKey: "companies/company-1/products/product-1/image-2.jpg",
    uploadUrl: "https://signed.example/upload",
    expiresAt: "2026-03-12T00:15:00.000Z",
    method: "PUT",
    contentType: input.contentType,
    maxSizeBytes: input.sizeBytes,
  }),
  completeUpload: async () => ({
    ...baseImage,
    id: "image-2",
  }),
  deleteImage: async (_companyId: string, productId: string, imageId: string) => ({
    productId,
    imageId,
    objectKey: "companies/company-1/products/product-1/image-2.jpg",
  }),
  ...overrides,
});

const createTestApp = (
  productsService: ProductsService,
  productMediaService: ProductMediaService = createStubProductMediaService(),
) =>
  createApp({
    productsService,
    productMediaService,
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
          images: [],
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
        images: [],
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
    });
    expect(body).toEqual({
      ok: true,
      product: {
        id: baseProductDetail.id,
        companyId: baseProductDetail.companyId,
        categoryId: "category-2",
        nameEn: "Updated Burger Box",
        images: baseProductDetail.images,
        variants: baseProductDetail.variants,
      },
    });
  });

  test("POST /api/companies/:companyId/products/:id/images/uploads creates a presigned upload", async () => {
    let receivedInput: CreateProductImageUploadInput | undefined;
    const productMediaService = createStubProductMediaService({
      createUpload: async (_companyId, _productId, input) => {
        receivedInput = input;
        return {
          uploadId: "upload-1",
          imageId: "image-2",
          objectKey: "companies/company-1/products/product-1/image-2.jpg",
          uploadUrl: "https://signed.example/upload",
          expiresAt: "2026-03-12T00:15:00.000Z",
          method: "PUT",
          contentType: input.contentType,
          maxSizeBytes: input.sizeBytes,
        };
      },
    });
    const app = createTestApp(createStubProductsService(), productMediaService);

    const response = await app.request("/api/companies/company-1/products/product-1/images/uploads", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        contentType: " image/jpeg ",
        sizeBytes: 1024,
        alt: " Front view ",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(receivedInput).toEqual({
      contentType: "image/jpeg",
      sizeBytes: 1024,
      alt: "Front view",
    });
    expect(body).toEqual({
      ok: true,
      upload: {
        uploadId: "upload-1",
        imageId: "image-2",
        objectKey: "companies/company-1/products/product-1/image-2.jpg",
        uploadUrl: "https://signed.example/upload",
        expiresAt: "2026-03-12T00:15:00.000Z",
        method: "PUT",
        contentType: "image/jpeg",
        maxSizeBytes: 1024,
      },
    });
  });

  test("POST /api/companies/:companyId/products/:id/images/uploads/:uploadId/complete finalizes an upload", async () => {
    const app = createTestApp(createStubProductsService(), createStubProductMediaService());

    const response = await app.request(
      "/api/companies/company-1/products/product-1/images/uploads/upload-1/complete",
      {
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      image: {
        ...baseImage,
        id: "image-2",
      },
    });
  });

  test("POST /api/companies/:companyId/products/:id/images/uploads/:uploadId/complete returns 404 when the parent product does not exist", async () => {
    const app = createTestApp(createStubProductsService(), createStubProductMediaService({
      completeUpload: async () => {
        throw new ProductMediaServiceError(ERROR_CODES.NOT_FOUND, "Product not found", 404);
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/images/uploads/upload-1/complete",
      {
        method: "POST",
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

  test("POST /api/companies/:companyId/products/:id/images/uploads/:uploadId/complete returns 404 when the upload session does not exist", async () => {
    const app = createTestApp(createStubProductsService(), createStubProductMediaService({
      completeUpload: async () => null,
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/images/uploads/upload-1/complete",
      {
        method: "POST",
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
        message: "Upload session not found",
      },
    });
  });

  test("DELETE /api/companies/:companyId/products/:id/images/:imageId removes a product image", async () => {
    const deletedResult: DeleteProductImageResult = {
      productId: "product-1",
      imageId: "image-2",
      objectKey: "companies/company-1/products/product-1/image-2.jpg",
    };
    const app = createTestApp(createStubProductsService(), createStubProductMediaService({
      deleteImage: async () => deletedResult,
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/images/image-2",
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

  test("DELETE /api/companies/:companyId/products/:id/images/:imageId returns 404 when the image does not exist", async () => {
    const app = createTestApp(createStubProductsService(), createStubProductMediaService({
      deleteImage: async () => {
        throw new ProductMediaServiceError(ERROR_CODES.NOT_FOUND, "Product image not found", 404);
      },
    }));

    const response = await app.request(
      "/api/companies/company-1/products/product-1/images/image-2",
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
        message: "Product image not found",
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
