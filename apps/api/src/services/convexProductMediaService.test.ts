import { describe, expect, test } from 'bun:test';
import { convexInternal } from '@cs/db';
import { ConfigError, ERROR_CODES } from '@cs/shared';
import { getFunctionName } from 'convex/server';
import { StorageError } from '@cs/storage';
import { createConvexProductMediaService } from './convexProductMediaService';
import {
  createProductMediaConfigError,
  createProductMediaStorageError,
  createProductMediaValidationError,
} from './productMedia';

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient, storageOverrides: Partial<ReturnType<typeof createStorageStub>> = {}) =>
  createConvexProductMediaService({
    createClient: () => client as never,
    createStorage: () => createStorageStub(storageOverrides) as never,
    now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
  });

const createStorageStub = (
  overrides: Partial<{
    createPresignedUpload: (request: unknown) => Promise<{ url: string; expiresAt: string }>;
    createPresignedDownload: (request: unknown) => Promise<{ url: string; expiresAt: string }>;
    statObject: (key: string) => Promise<{
      etag?: string;
      size: number;
      contentType?: string;
    } | null>;
    deleteObject: (key: string) => Promise<void>;
  }> = {},
) => ({
  createPresignedUpload: async () => ({
    url: "https://signed.example/upload",
    expiresAt: "2026-03-12T00:15:00.000Z",
  }),
  createPresignedDownload: async () => ({
    url: "https://signed.example/download",
    expiresAt: "2026-03-12T00:15:00.000Z",
  }),
  statObject: async () => ({
    etag: '"etag-1"',
    size: 1024,
    contentType: "image/jpeg",
  }),
  deleteObject: async () => undefined,
  ...overrides,
});

describe("createConvexProductMediaService", () => {
  test("uses the internal Convex createUploadSession mutation reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return {
          uploadId: "upload-1",
          imageId: "image-1",
          objectKey: "companies/company-1/products/product-1/image-1.jpg",
          expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
        };
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    const upload = await service.createUpload("company-1", "product-1", {
      contentType: "image/jpeg",
      sizeBytes: 1024,
      alt: "Front view",
    });

    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.productMedia.createUploadSession),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      productId: "product-1",
      contentType: "image/jpeg",
      alt: "Front view",
      maxSizeBytes: 5_242_880,
      createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
    });
    expect(upload).toEqual({
      uploadId: "upload-1",
      imageId: "image-1",
      objectKey: "companies/company-1/products/product-1/image-1.jpg",
      uploadUrl: "https://signed.example/upload",
      expiresAt: "2026-03-12T00:15:00.000Z",
      method: "PUT",
      contentType: "image/jpeg",
      maxSizeBytes: 5_242_880,
    });
  });

  test("rejects unsupported upload content types before touching Convex", async () => {
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.createUpload("company-1", "product-1", {
      contentType: "application/pdf",
      sizeBytes: 1024,
    })).rejects.toEqual(
      createProductMediaValidationError("contentType must be one of: image/jpeg, image/png, image/webp"),
    );
  });

  test("completes an upload from the stored object stat and decorates the image with a download URL", async () => {
    const service = createService({
      query: async () => ({
        uploadId: "upload-1",
        companyId: "company-1",
        productId: "product-1",
        imageId: "image-1",
        objectKey: "companies/company-1/products/product-1/image-1.jpg",
        intendedContentType: "image/jpeg",
        maxSizeBytes: 5_242_880,
        status: "pending",
        expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
        createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      }),
      mutation: async () => ({
        id: "image-1",
        key: "companies/company-1/products/product-1/image-1.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1024,
        etag: '"etag-1"',
        uploadedAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      }),
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.completeUpload("company-1", "product-1", "upload-1")).resolves.toEqual({
      id: "image-1",
      key: "companies/company-1/products/product-1/image-1.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024,
      etag: '"etag-1"',
      uploadedAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      downloadUrl: "https://signed.example/download",
      downloadUrlExpiresAt: "2026-03-12T00:15:00.000Z",
    });
  });

  test("maps storage misconfiguration to a safe config error", async () => {
    const service = createService({
      query: async () => ({
        uploadId: "upload-1",
        companyId: "company-1",
        productId: "product-1",
        imageId: "image-1",
        objectKey: "companies/company-1/products/product-1/image-1.jpg",
        intendedContentType: "image/jpeg",
        maxSizeBytes: 5_242_880,
        status: "pending",
        expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
        createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      }),
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    }, {
      statObject: async () => {
        throw new ConfigError("Missing required environment variable: R2_ACCESS_KEY_ID", {
          code: ERROR_CODES.CONFIG_MISSING,
        });
      },
    });

    await expect(service.completeUpload("company-1", "product-1", "upload-1")).rejects.toEqual(
      createProductMediaConfigError("Product media storage is not configured"),
    );
  });

  test("maps storage adapter failures to a storage error", async () => {
    const service = createService({
      query: async () => ({
        uploadId: "upload-1",
        companyId: "company-1",
        productId: "product-1",
        imageId: "image-1",
        objectKey: "companies/company-1/products/product-1/image-1.jpg",
        intendedContentType: "image/jpeg",
        maxSizeBytes: 5_242_880,
        status: "pending",
        expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
        createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      }),
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    }, {
      statObject: async () => {
        throw new StorageError("temporary outage");
      },
    });

    await expect(service.completeUpload("company-1", "product-1", "upload-1")).rejects.toEqual(
      createProductMediaStorageError("Product media storage is temporarily unavailable"),
    );
  });
});
