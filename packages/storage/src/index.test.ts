import { afterEach, describe, expect, test } from 'bun:test';
import {
  createR2Storage,
  PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
  PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
  type StoredObjectStat,
} from './index';

interface StubS3File {
  presign: (options: Record<string, unknown>) => string;
  exists: () => Promise<boolean>;
  stat: () => Promise<StoredObjectStat>;
  delete: () => Promise<void>;
}

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
  });

  test("creates presigned upload and download URLs lazily from env", async () => {
    let receivedConfig: Record<string, string> | undefined;
    let receivedPresignOptions: Record<string, unknown> | undefined;

    process.env.R2_BUCKET_NAME = "media";
    process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";

    const storage = createR2Storage({
      now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
      createClient: (options) => {
        receivedConfig = options;
        return {
          file: () =>
            ({
              presign: (presignOptions) => {
                receivedPresignOptions = presignOptions;
                return "https://signed.example/upload";
              },
              exists: async () => true,
              stat: async () => ({
                etag: "\"etag\"",
                size: 12,
                type: "image/png",
              }),
              delete: async () => undefined,
            }) as StubS3File,
        } as never;
      },
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

    expect(receivedConfig).toEqual({
      bucket: "media",
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });
    expect(receivedPresignOptions).toEqual({
      method: "GET",
      expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
    });
    expect(upload.url).toBe("https://signed.example/upload");
    expect(download.url).toBe("https://signed.example/upload");
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
          file: () =>
            ({
              presign: () => "",
              exists: async () => false,
              stat: async () => ({
                size: 0,
              }),
              delete: async () => undefined,
            }) as StubS3File,
        }) as never,
    });

    await expect(storage.statObject("missing")).resolves.toBeNull();
  });
});
