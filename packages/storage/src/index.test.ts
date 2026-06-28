import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createR2Storage,
  isExplicitObjectNotFoundError,
  PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
  PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
  type AllowedProductImageMimeType,
  type R2StorageOptions,
} from './index';

type StubCreateClient = NonNullable<R2StorageOptions["createClient"]>;
type StubUploadInput = {
  key: string;
  contentType: AllowedProductImageMimeType;
  expiresIn: number;
};
type StubDownloadInput = {
  key: string;
  expiresIn: number;
};

describe("@cs/storage", () => {
  const previousEnv = {
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    vi.restoreAllMocks();
  });

  test("creates presigned upload and download URLs lazily from env", async () => {
    let receivedConfig: Record<string, string> | undefined;
    const receivedUploadCalls: Array<Record<string, unknown>> = [];
    const receivedDownloadCalls: Array<Record<string, unknown>> = [];
    let createClientCount = 0;

    process.env.R2_BUCKET_NAME = "media";
    process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";

    const storage = createR2Storage({
      now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
      createClient: ((options) => {
        createClientCount += 1;
        receivedConfig = options;
        return {
          createPresignedUpload: async (input: StubUploadInput) => {
            receivedUploadCalls.push(input);
            return "https://signed.example/upload";
          },
          createPresignedDownload: async (input: StubDownloadInput) => {
            receivedDownloadCalls.push(input);
            return "https://signed.example/download";
          },
          statObject: async () => ({
            etag: "\"etag\"",
            size: 12,
            contentType: "image/png",
          }),
          deleteObject: async () => undefined,
        } as never;
      }) satisfies StubCreateClient,
    });

    const upload = await storage.createPresignedUpload({
      key: "companies/a/products/b/file.png",
      contentType: "image/png",
      expiresIn: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
    });
    const download = await storage.createPresignedDownload({
      key: "companies/a/products/b/file.png",
      expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
    });
    const stat = await storage.statObject("companies/a/products/b/file.png");
    await expect(storage.deleteObject("companies/a/products/b/file.png")).resolves.toBeUndefined();

    expect(receivedConfig).toEqual({
      bucket: "media",
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });
    expect(createClientCount).toBe(1);
    expect(receivedUploadCalls).toEqual([
      {
        key: "companies/a/products/b/file.png",
        contentType: "image/png",
        expiresIn: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
      },
    ]);
    expect(receivedDownloadCalls).toEqual([
      {
        key: "companies/a/products/b/file.png",
        expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
      },
    ]);
    expect(upload.url).toBe("https://signed.example/upload");
    expect(download.url).toBe("https://signed.example/download");
    expect(stat).toEqual({
      etag: "\"etag\"",
      size: 12,
      contentType: "image/png",
    });
    expect(upload.expiresAt).toBe("2026-03-12T00:15:00.000Z");
    expect(download.expiresAt).toBe("2026-03-12T00:15:00.000Z");
  });

  test("returns null when the object does not exist", async () => {
    process.env.R2_BUCKET_NAME = "media";
    process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";

    const storage = createR2Storage({
      createClient: () =>
        ({
          createPresignedUpload: async () => "",
          createPresignedDownload: async () => "",
          statObject: async () => null,
          deleteObject: async () => undefined,
        }) as never,
    });

    await expect(storage.statObject("missing")).resolves.toBeNull();
  });

  test("identifies explicit object-not-found S3 errors", () => {
    expect(
      isExplicitObjectNotFoundError({
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(true);
    expect(
      isExplicitObjectNotFoundError({
        Code: "NotFound",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(true);
  });

  test("does not treat generic 404 storage errors as missing objects", () => {
    expect(
      isExplicitObjectNotFoundError({
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(false);
    expect(
      isExplicitObjectNotFoundError({
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(false);
  });

  test("creates the R2 client once and reuses it for later operations", async () => {
    let createClientCount = 0;
    process.env.R2_BUCKET_NAME = "media";
    process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";

    const storage = createR2Storage({
      createClient: () => {
        createClientCount += 1;
        return {
          createPresignedUpload: async () => "https://signed.example/upload",
          createPresignedDownload: async () => "https://signed.example/download",
          statObject: async () => ({ size: 12 }),
          deleteObject: async () => undefined,
        } as never;
      },
    });

    await storage.createPresignedUpload({
      key: "companies/a/products/b/file.png",
      contentType: "image/png",
      expiresIn: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
    });

    await storage.createPresignedDownload({
      key: "companies/a/products/b/file.png",
      expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
    });

    expect(createClientCount).toBe(1);
  });
});
