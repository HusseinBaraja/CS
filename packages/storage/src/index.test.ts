import { afterEach, describe, expect, mock, test } from 'bun:test';
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

    mock.restore();
  });

  test("creates presigned upload and download URLs lazily from env", async () => {
    let receivedConfig: Record<string, string> | undefined;
    const receivedPresignOptionsCalls: Array<Record<string, unknown>> = [];
    let createClientCount = 0;

    process.env.R2_BUCKET_NAME = "media";
    process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";

    const storage = createR2Storage({
      now: () => Date.UTC(2026, 2, 12, 0, 0, 0),
      createClient: (options) => {
        createClientCount += 1;
        receivedConfig = options;
        return {
          file: () =>
            ({
              presign: (presignOptions) => {
                receivedPresignOptionsCalls.push(presignOptions);
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
    const stat = await storage.statObject("companies/a/products/b/file.png");
    await expect(storage.deleteObject("companies/a/products/b/file.png")).resolves.toBeUndefined();

    expect(receivedConfig).toEqual({
      bucket: "media",
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });
    expect(createClientCount).toBe(1);
    expect(receivedPresignOptionsCalls).toEqual([
      {
        method: "PUT",
        type: "image/png",
        expiresIn: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
      },
      {
        method: "GET",
        expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
      },
    ]);
    expect(receivedPresignOptionsCalls[0]).toEqual({
      method: "PUT",
      type: "image/png",
      expiresIn: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
    });
    expect(receivedPresignOptionsCalls[1]).toEqual({
      method: "GET",
      expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
    });
    expect(upload.url).toBe("https://signed.example/upload");
    expect(download.url).toBe("https://signed.example/upload");
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

  test("parses the R2 config once when creating a storage client", async () => {
    let createConfigCount = 0;

    mock.module("@cs/config", () => ({
      createConfig: (runtimeEnv: Record<string, string | number | boolean | undefined>) => {
        createConfigCount += 1;
        return runtimeEnv;
      },
      requireConfigValue: <
        TConfig extends Record<string, unknown>,
        TKey extends keyof TConfig
      >(config: TConfig, key: TKey) => {
        const value = config[key];

        if (value === undefined || value === null || (typeof value === "string" && value === "")) {
          throw new Error(`Missing required environment variable: ${String(key)}`);
        }

        return value as Exclude<TConfig[TKey], null | undefined>;
      },
    }));

    process.env.R2_BUCKET_NAME = "media";
    process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";

    const moduleUrl = new URL(`./index.ts?single-parse=${Date.now()}`, import.meta.url).href;
    const { createR2Storage: createIsolatedR2Storage } = await import(moduleUrl);

    const storage = createIsolatedR2Storage({
      createClient: () =>
        ({
          file: () =>
            ({
              presign: () => "https://signed.example/upload",
              exists: async () => true,
              stat: async () => ({
                size: 12,
              }),
              delete: async () => undefined,
            }) as StubS3File,
        }) as never,
    });

    await storage.createPresignedUpload({
      key: "companies/a/products/b/file.png",
      contentType: "image/png",
      expiresIn: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
    });

    expect(createConfigCount).toBe(1);
  });
});
