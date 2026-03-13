import { describe, expect, test } from 'bun:test';
import { convexInternal } from '@cs/db';
import { PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS, type ObjectStorage } from '@cs/storage';
import { ERROR_CODES } from '@cs/shared';
import { getFunctionName } from 'convex/server';
import { createConvexProductsService } from './convexProductsService';
import {
  createAiServiceError,
  createConflictServiceError,
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
  ProductsServiceError,
} from './products';

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (
  client: StubConvexClient,
  options: {
    createStorage?: () => ObjectStorage;
  } = {},
) =>
  createConvexProductsService({
    createClient: () => client as never,
    ...options,
  });

describe("createConvexProductsService", () => {
  test("uses internal Convex product references", async () => {
    let receivedReference: unknown;
    const service = createService({
      query: async (reference) => {
        receivedReference = reference;
        return [];
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.list),
    );
  });

  test("rethrows existing ProductsServiceError instances unchanged", async () => {
    const error = new ProductsServiceError(
      ERROR_CODES.NOT_FOUND,
      "Product not found",
      404,
    );
    const service = createService({
      query: async () => {
        throw error;
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toBe(error);
  });

  test("maps tagged Convex errors to service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("AI_PROVIDER_FAILED: Gemini rate limit exceeded");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toEqual(
      createAiServiceError("Gemini rate limit exceeded"),
    );
  });

  test("maps decode and argument validation failures to validation service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("ArgumentValidationError: Unable to decode value");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toEqual(
      createValidationServiceError("Invalid product, company, category, or variant identifier"),
    );
  });

  test("maps unknown errors to database unavailable errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("socket hang up");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toEqual(
      createDatabaseServiceError("Product data is temporarily unavailable"),
    );
  });

  test("maps not found tags on actions", async () => {
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("NOT_FOUND: Category not found");
      },
    });

    await expect(service.create("company-1", {
      categoryId: "category-1",
      nameEn: "Burger Box",
    })).rejects.toEqual(createNotFoundServiceError("Category not found"));
  });

  test("maps conflict tags on actions", async () => {
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("CONFLICT: Product was modified concurrently; retry the update");
      },
    });

    await expect(service.update("company-1", "product-1", {
      nameEn: "Updated Burger Box",
    })).rejects.toEqual(
      createConflictServiceError("Product was modified concurrently; retry the update"),
    );
  });

  test("uses the internal Convex variant query reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return [];
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.listVariants("company-1", "product-1")).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.listVariants),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      productId: "product-1",
    });
  });

  test("uses the internal Convex createVariant action reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return {
          id: "variant-1",
          productId: "product-1",
          variantLabel: "Family Pack",
          attributes: {
            nested: {
              tone: "warm",
            },
          },
        };
      },
    });

    await expect(service.createVariant("company-1", "product-1", {
      variantLabel: "Family Pack",
      attributes: {
        nested: {
          tone: "warm",
        },
      },
    })).resolves.toEqual({
      id: "variant-1",
      productId: "product-1",
      variantLabel: "Family Pack",
      attributes: {
        nested: {
          tone: "warm",
        },
      },
    });
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.createVariant),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      productId: "product-1",
      variantLabel: "Family Pack",
      attributes: {
        nested: {
          tone: "warm",
        },
      },
    });
  });

  test("uses the internal Convex updateVariant action reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return {
          id: "variant-1",
          productId: "product-1",
          variantLabel: "Updated",
          attributes: {
            size: "XL",
          },
        };
      },
    });

    await expect(service.updateVariant("company-1", "product-1", "variant-1", {
      variantLabel: "Updated",
      attributes: {
        size: "XL",
      },
      priceOverride: null,
    })).resolves.toEqual({
      id: "variant-1",
      productId: "product-1",
      variantLabel: "Updated",
      attributes: {
        size: "XL",
      },
    });
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.updateVariant),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      productId: "product-1",
      variantId: "variant-1",
      variantLabel: "Updated",
      attributes: {
        size: "XL",
      },
      priceOverride: null,
    });
  });

  test("uses the internal Convex removeVariant action reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return {
          productId: "product-1",
          variantId: "variant-1",
        };
      },
    });

    await expect(service.deleteVariant("company-1", "product-1", "variant-1")).resolves.toEqual({
      productId: "product-1",
      variantId: "variant-1",
    });
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.removeVariant),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      productId: "product-1",
      variantId: "variant-1",
    });
  });

  test("maps variant validation tags on actions", async () => {
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("VALIDATION_FAILED: attributes.nested must be an object");
      },
    });

    await expect(service.createVariant("company-1", "product-1", {
      variantLabel: "Large",
      attributes: {
        nested: "bad",
      },
    })).rejects.toEqual(
      createValidationServiceError("attributes.nested must be an object"),
    );
  });

  test("maps variant AI failures on actions", async () => {
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("AI_PROVIDER_FAILED: Gemini rate limit exceeded");
      },
    });

    await expect(service.deleteVariant("company-1", "product-1", "variant-1")).rejects.toEqual(
      createAiServiceError("Gemini rate limit exceeded"),
    );
  });

  test("reuses one storage instance while decorating multiple images", async () => {
    let storageCreationCount = 0;
    const downloadRequests: Array<{ key: string; expiresIn: number }> = [];
    const service = createService({
      query: async () => [{
        id: "product-1",
        companyId: "company-1",
        categoryId: "category-1",
        nameEn: "Burger Box",
        images: [
          {
            id: "image-1",
            key: "products/image-1.jpg",
            contentType: "image/jpeg",
            sizeBytes: 100,
            uploadedAt: 1,
          },
          {
            id: "image-2",
            key: "products/image-2.jpg",
            contentType: "image/jpeg",
            sizeBytes: 200,
            uploadedAt: 2,
          },
        ],
      }],
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    }, {
      createStorage: () => {
        storageCreationCount += 1;
        return {
          createPresignedUpload: async () => {
            throw new Error("not used");
          },
          createPresignedDownload: async (request) => {
            downloadRequests.push(request);
            return {
              url: `https://signed.example/${request.key}`,
              expiresAt: "2026-03-12T00:15:00.000Z",
            };
          },
          statObject: async () => {
            throw new Error("not used");
          },
          deleteObject: async () => {
            throw new Error("not used");
          },
        };
      },
    });

    await expect(service.list("company-1", {})).resolves.toEqual([
      {
        id: "product-1",
        companyId: "company-1",
        categoryId: "category-1",
        nameEn: "Burger Box",
        images: [
          {
            id: "image-1",
            key: "products/image-1.jpg",
            contentType: "image/jpeg",
            sizeBytes: 100,
            uploadedAt: 1,
            downloadUrl: "https://signed.example/products/image-1.jpg",
            downloadUrlExpiresAt: "2026-03-12T00:15:00.000Z",
          },
          {
            id: "image-2",
            key: "products/image-2.jpg",
            contentType: "image/jpeg",
            sizeBytes: 200,
            uploadedAt: 2,
            downloadUrl: "https://signed.example/products/image-2.jpg",
            downloadUrlExpiresAt: "2026-03-12T00:15:00.000Z",
          },
        ],
      },
    ]);
    expect(storageCreationCount).toBe(1);
    expect(downloadRequests).toEqual([
      {
        key: "products/image-1.jpg",
        expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
      },
      {
        key: "products/image-2.jpg",
        expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
      },
    ]);
  });

  test("returns the original image when presigning fails", async () => {
    const service = createService({
      query: async () => ({
        id: "product-1",
        companyId: "company-1",
        categoryId: "category-1",
        nameEn: "Burger Box",
        images: [
          {
            id: "image-1",
            key: "products/image-1.jpg",
            contentType: "image/jpeg",
            sizeBytes: 100,
            uploadedAt: 1,
          },
        ],
        variants: [],
      }),
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    }, {
      createStorage: () => ({
        createPresignedUpload: async () => {
          throw new Error("not used");
        },
        createPresignedDownload: async () => {
          throw new Error("presign failed");
        },
        statObject: async () => {
          throw new Error("not used");
        },
        deleteObject: async () => {
          throw new Error("not used");
        },
      }),
    });

    await expect(service.get("company-1", "product-1")).resolves.toEqual({
      id: "product-1",
      companyId: "company-1",
      categoryId: "category-1",
      nameEn: "Burger Box",
      images: [
        {
          id: "image-1",
          key: "products/image-1.jpg",
          contentType: "image/jpeg",
          sizeBytes: 100,
          uploadedAt: 1,
        },
      ],
      variants: [],
    });
  });
});
