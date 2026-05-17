import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import {
  type CreateProductInput,
  type CreateProductVariantInput,
  type ListProductsFilters,
  type ProductDetailDto,
  type ProductListItemDto,
  type ProductsService,
  ProductsServiceError,
  type ProductVariantDto,
  type UpdateProductInput,
  type UpdateProductVariantInput,
} from '../services/products';
import {
  type CreateProductImageUploadInput,
  type ProductImageDto,
  type ProductMediaService,
} from '../services/productMedia';

const API_KEY = 'test-api-key';

const baseProduct: ProductListItemDto = {
  id: 'product-1',
  companyId: 'company-1',
  categoryId: 'category-1',
  productNo: 'P-1',
  nameEn: 'Burger Box',
  nameAr: 'علبة برجر',
  descriptionEn: 'Disposable meal box',
  descriptionAr: 'علبة طعام',
  price: 1.25,
  currency: 'SAR',
  primaryImage: 'companies/company-1/products/product-1/image-1.jpg',
};

const baseVariant: ProductVariantDto = {
  id: 'variant-1',
  companyId: 'company-1',
  productId: 'product-1',
  labelEn: 'Large',
  price: 1.5,
};

const baseProductDetail: ProductDetailDto = {
  ...baseProduct,
  variants: [baseVariant],
};

const otherCompanyProduct: ProductDetailDto = {
  ...baseProductDetail,
  id: 'product-2',
  companyId: 'company-2',
  primaryImage: 'companies/company-2/products/product-2/image-2.jpg',
  variants: [{
    ...baseVariant,
    id: 'variant-2',
    companyId: 'company-2',
    productId: 'product-2',
  }],
};

const authHeaders = {
  'x-api-key': API_KEY,
  'content-type': 'application/json',
};

const createStubProductsService = (
  overrides: Partial<ProductsService> = {},
): ProductsService => ({
  list: async () => [],
  get: async () => null,
  create: async (_companyId: string, input: CreateProductInput) => ({
    id: 'product-created',
    companyId: 'company-1',
    ...input,
    variants: [],
  }),
  update: async (_companyId: string, _productId: string, patch: UpdateProductInput) => ({
    ...baseProductDetail,
    categoryId: patch.categoryId ?? baseProductDetail.categoryId,
    productNo: patch.productNo === null ? undefined : patch.productNo ?? baseProductDetail.productNo,
    nameEn: patch.nameEn === null ? undefined : patch.nameEn ?? baseProductDetail.nameEn,
    nameAr: patch.nameAr === null ? undefined : patch.nameAr ?? baseProductDetail.nameAr,
    descriptionEn:
      patch.descriptionEn === null
        ? undefined
        : patch.descriptionEn ?? baseProductDetail.descriptionEn,
    descriptionAr:
      patch.descriptionAr === null
        ? undefined
        : patch.descriptionAr ?? baseProductDetail.descriptionAr,
    price: patch.price === null ? undefined : patch.price ?? baseProductDetail.price,
    currency: patch.currency === null ? undefined : patch.currency ?? baseProductDetail.currency,
  }),
  delete: async () => ({
    productId: 'product-1',
  }),
  listVariants: async () => [baseVariant],
  createVariant: async (_companyId: string, productId: string, input: CreateProductVariantInput) => ({
    id: 'variant-created',
    companyId: 'company-1',
    productId,
    ...input,
  }),
  updateVariant: async (_companyId: string, productId: string, variantId: string, patch: UpdateProductVariantInput) => ({
    ...baseVariant,
    id: variantId,
    productId,
    labelEn: patch.labelEn ?? baseVariant.labelEn,
    ...(patch.price !== null && patch.price !== undefined ? { price: patch.price } : {}),
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
    uploadId: 'upload-1',
    imageId: 'image-2',
    objectKey: 'companies/company-1/products/product-1/image-2.jpg',
    uploadUrl: 'https://signed.example/upload',
    expiresAt: '2026-03-12T00:15:00.000Z',
    method: 'PUT',
    contentType: input.contentType,
    maxSizeBytes: input.sizeBytes,
  }),
  completeUpload: async (): Promise<ProductImageDto> => ({
    id: 'image-2',
    key: 'companies/company-1/products/product-1/image-2.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    uploadedAt: Date.UTC(2026, 2, 12, 0, 0, 0),
    downloadUrl: 'https://signed.example/download',
    downloadUrlExpiresAt: '2026-03-12T00:15:00.000Z',
  }),
  deleteImage: async (_companyId: string, productId: string, imageId: string) => ({
    productId,
    imageId,
    objectKey: 'companies/company-1/products/product-1/image-2.jpg',
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

describe('product routes', () => {
  test('GET /api/companies/:companyId/products returns products and forwards query filters', async () => {
    let receivedFilters: ListProductsFilters | undefined;
    const app = createTestApp(createStubProductsService({
      list: async (_companyId, filters) => {
        receivedFilters = filters;
        return [baseProduct];
      },
    }));

    const response = await app.request('/api/companies/company-1/products?categoryId=category-1&search=box', {
      headers: authHeaders,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      products: [baseProduct],
    });
    expect(receivedFilters).toEqual({
      categoryId: 'category-1',
      search: 'box',
    });
  });

  test('POST /api/companies/:companyId/products creates a product with new fields', async () => {
    let receivedInput: CreateProductInput | undefined;
    const app = createTestApp(createStubProductsService({
      create: async (_companyId, input) => {
        receivedInput = input;
        return {
          id: 'product-created',
          companyId: 'company-1',
          ...input,
          variants: [],
        };
      },
    }));

    const response = await app.request('/api/companies/company-1/products', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: 'category-1',
        productNo: ' P-1 ',
        nameAr: ' علبة ',
        price: 1.25,
        currency: ' SAR ',
        primaryImage: ' image-key ',
      }),
    });

    expect(response.status).toBe(201);
    expect(receivedInput).toEqual({
      categoryId: 'category-1',
      productNo: 'P-1',
      nameAr: 'علبة',
      price: 1.25,
      currency: 'SAR',
      primaryImage: 'image-key',
    });
  });

  test('POST /api/companies/:companyId/products allows productNo-only creates', async () => {
    let receivedInput: CreateProductInput | undefined;
    const app = createTestApp(createStubProductsService({
      create: async (_companyId, input) => {
        receivedInput = input;
        return {
          id: 'product-created',
          companyId: 'company-1',
          ...input,
          variants: [],
        };
      },
    }));

    const response = await app.request('/api/companies/company-1/products', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: 'category-1',
        productNo: ' SKU-1 ',
      }),
    });

    expect(response.status).toBe(201);
    expect(receivedInput).toEqual({
      categoryId: 'category-1',
      productNo: 'SKU-1',
    });
  });

  test('PUT /api/companies/:companyId/products/:id updates nullable product fields', async () => {
    let receivedPatch: UpdateProductInput | undefined;
    const app = createTestApp(createStubProductsService({
      update: async (_companyId, _productId, patch) => {
        receivedPatch = patch;
        return baseProductDetail;
      },
    }));

    const response = await app.request('/api/companies/company-1/products/product-1', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        productNo: null,
        nameEn: ' Updated ',
        price: null,
        currency: null,
        primaryImage: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(receivedPatch).toEqual({
      productNo: null,
      nameEn: 'Updated',
      price: null,
      currency: null,
      primaryImage: null,
    });
  });

  test('product routes do not expose resources from another company', async () => {
    const notFoundBody = {
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Product not found',
      },
    };
    const app = createTestApp(
      createStubProductsService({
        list: async (companyId) => (
          otherCompanyProduct.companyId === companyId ? [otherCompanyProduct] : []
        ),
        get: async (companyId, productId) => (
          otherCompanyProduct.companyId === companyId && otherCompanyProduct.id === productId
            ? otherCompanyProduct
            : null
        ),
        update: async (companyId, productId, patch) => (
          otherCompanyProduct.companyId === companyId && otherCompanyProduct.id === productId
            ? {
              ...otherCompanyProduct,
              nameEn: patch.nameEn === null ? undefined : patch.nameEn ?? otherCompanyProduct.nameEn,
            }
            : null
        ),
        createVariant: async (companyId, productId, input) => (
          otherCompanyProduct.companyId === companyId && otherCompanyProduct.id === productId
            ? {
              id: 'variant-created',
              companyId,
              productId,
              ...input,
            }
            : null
        ),
        updateVariant: async (companyId, productId, variantId, patch) => {
          const variant = otherCompanyProduct.variants.find((item) => item.id === variantId);
          return otherCompanyProduct.companyId === companyId
            && otherCompanyProduct.id === productId
            && variant
            ? {
              ...variant,
              labelEn: patch.labelEn === null ? undefined : patch.labelEn ?? variant.labelEn,
              labelAr: patch.labelAr === null ? undefined : patch.labelAr ?? variant.labelAr,
              price: patch.price === null ? undefined : patch.price ?? variant.price,
            }
            : null;
        },
      }),
      createStubProductMediaService({
        deleteImage: async (companyId, productId, imageId) => (
          companyId === otherCompanyProduct.companyId
            && productId === otherCompanyProduct.id
            && imageId === 'image-2'
            ? {
              productId,
              imageId,
              objectKey: otherCompanyProduct.primaryImage ?? '',
            }
            : null
        ),
      }),
    );

    const listResponse = await app.request('/api/companies/company-1/products', {
      headers: authHeaders,
    });
    const getResponse = await app.request('/api/companies/company-1/products/product-2', {
      headers: authHeaders,
    });
    const updateResponse = await app.request('/api/companies/company-1/products/product-2', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        nameEn: 'Updated',
      }),
    });
    const createVariantResponse = await app.request('/api/companies/company-1/products/product-2/variants', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        labelEn: 'Large',
      }),
    });
    const updateVariantResponse = await app.request(
      '/api/companies/company-1/products/product-2/variants/variant-2',
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          labelEn: 'Small',
        }),
      },
    );
    const deleteImageResponse = await app.request('/api/companies/company-1/products/product-2/images/image-2', {
      method: 'DELETE',
      headers: authHeaders,
    });

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      ok: true,
      products: [],
    });
    expect(getResponse.status).toBe(404);
    expect(await getResponse.json()).toEqual(notFoundBody);
    expect(updateResponse.status).toBe(404);
    expect(await updateResponse.json()).toEqual(notFoundBody);
    expect(createVariantResponse.status).toBe(404);
    expect(await createVariantResponse.json()).toEqual(notFoundBody);
    expect(updateVariantResponse.status).toBe(404);
    expect(await updateVariantResponse.json()).toEqual(notFoundBody);
    expect(deleteImageResponse.status).toBe(404);
    expect(await deleteImageResponse.json()).toEqual(notFoundBody);
  });

  test('POST /api/companies/:companyId/products rejects missing product identifiers', async () => {
    const app = createTestApp(createStubProductsService());

    const response = await app.request('/api/companies/company-1/products', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: 'category-1',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'at least one of productNo, nameEn or nameAr is required',
      },
    });
  });

  test('variant routes use label and optional price', async () => {
    let createInput: CreateProductVariantInput | undefined;
    let updatePatch: UpdateProductVariantInput | undefined;
    const app = createTestApp(createStubProductsService({
      createVariant: async (_companyId, productId, input) => {
        createInput = input;
        return {
          id: 'variant-created',
          companyId: 'company-1',
          productId,
          ...input,
        };
      },
      updateVariant: async (_companyId, productId, variantId, patch) => {
        updatePatch = patch;
        return {
          id: variantId,
          companyId: 'company-1',
          productId,
          labelEn: patch.labelEn ?? 'Large',
        };
      },
    }));

    const createResponse = await app.request('/api/companies/company-1/products/product-1/variants', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        labelEn: ' Large ',
        price: 1.5,
      }),
    });
    const updateResponse = await app.request('/api/companies/company-1/products/product-1/variants/variant-1', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        labelEn: ' Small ',
        price: null,
      }),
    });

    expect(createResponse.status).toBe(201);
    expect(updateResponse.status).toBe(200);
    expect(createInput).toEqual({
      labelEn: 'Large',
      price: 1.5,
    });
    expect(updatePatch).toEqual({
      labelEn: 'Small',
      price: null,
    });
  });

  test('media routes keep primary-image upload lifecycle separate from product DTOs', async () => {
    const app = createTestApp(createStubProductsService());

    const createResponse = await app.request('/api/companies/company-1/products/product-1/images/uploads', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        contentType: ' image/jpeg ',
        sizeBytes: 1024,
      }),
    });
    const completeResponse = await app.request(
      '/api/companies/company-1/products/product-1/images/uploads/upload-1/complete',
      {
        method: 'POST',
        headers: authHeaders,
      },
    );
    const deleteResponse = await app.request('/api/companies/company-1/products/product-1/images/image-2', {
      method: 'DELETE',
      headers: authHeaders,
    });

    expect(createResponse.status).toBe(201);
    expect(completeResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
  });

  test('service errors are mapped', async () => {
    const app = createTestApp(createStubProductsService({
      create: async () => {
        throw new ProductsServiceError(ERROR_CODES.AI_PROVIDER_FAILED, 'Embedding failed', 503);
      },
    }));

    const response = await app.request('/api/companies/company-1/products', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        categoryId: 'category-1',
        nameEn: 'Burger Box',
      }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.AI_PROVIDER_FAILED,
        message: 'Embedding failed',
      },
    });
  });
});
