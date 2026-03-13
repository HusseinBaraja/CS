import { S3Client } from 'bun';
import { createConfig, requireConfigValue } from '@cs/config';
import { AppError, ERROR_CODES } from '@cs/shared';

export const PRODUCT_IMAGE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const PRODUCT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS = 15 * 60;
export const PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS = 15 * 60;

export type AllowedProductImageMimeType = (typeof PRODUCT_IMAGE_ALLOWED_MIME_TYPES)[number];

export interface PresignedUploadRequest {
  key: string;
  contentType: AllowedProductImageMimeType;
  expiresIn: number;
}

export interface PresignedDownloadRequest {
  key: string;
  expiresIn: number;
}

export interface StoredObjectStat {
  etag?: string;
  size: number;
  contentType?: string;
  lastModified?: Date;
}

export interface ObjectStorage {
  createPresignedUpload(request: PresignedUploadRequest): Promise<{ url: string; expiresAt: string }>;
  createPresignedDownload(
    request: PresignedDownloadRequest,
  ): Promise<{ url: string; expiresAt: string }>;
  statObject(key: string): Promise<StoredObjectStat | null>;
  deleteObject(key: string): Promise<void>;
}

export interface R2StorageOptions {
  createClient?: (options: {
    bucket: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) => S3Client;
  now?: () => number;
}

export class StorageError extends AppError {
  constructor(message: string, options: { cause?: unknown; context?: Record<string, unknown> } = {}) {
    super(ERROR_CODES.STORAGE_FAILED, message, options);
  }
}

const toIsoExpiry = (now: number, expiresIn: number) => new Date(now + expiresIn * 1000).toISOString();

const createStorageClient = (
  runtimeEnv: Record<string, string | number | boolean | undefined> = process.env,
  createClient: NonNullable<R2StorageOptions["createClient"]> = (options) => new S3Client(options),
): S3Client => {
  const config = createConfig(runtimeEnv);

  return createClient({
    bucket: requireConfigValue(config, "R2_BUCKET_NAME"),
    endpoint: requireConfigValue(config, "R2_ENDPOINT"),
    accessKeyId: requireConfigValue(config, "R2_ACCESS_KEY_ID"),
    secretAccessKey: requireConfigValue(config, "R2_SECRET_ACCESS_KEY"),
  });
};

const normalizeStorageFailure = (
  message: string,
  cause: unknown,
  context: Record<string, unknown>,
): never => {
  throw new StorageError(message, {
    cause,
    context,
  });
};

export const createR2Storage = (options: R2StorageOptions = {}): ObjectStorage => {
  const now = options.now ?? Date.now;
  let client: S3Client | undefined;

  const getClient = () => {
    client ??= createStorageClient(process.env, options.createClient);
    return client;
  };

  return {
    async createPresignedUpload(request): Promise<{ url: string; expiresAt: string }> {
      try {
        const url = getClient().file(request.key).presign({
          method: "PUT",
          type: request.contentType,
          expiresIn: request.expiresIn,
        });

        return {
          url,
          expiresAt: toIsoExpiry(now(), request.expiresIn),
        };
      } catch (error) {
        return normalizeStorageFailure("Failed to create presigned upload URL", error, { key: request.key });
      }
    },
    async createPresignedDownload(request): Promise<{ url: string; expiresAt: string }> {
      try {
        const url = getClient().file(request.key).presign({
          method: "GET",
          expiresIn: request.expiresIn,
        });

        return {
          url,
          expiresAt: toIsoExpiry(now(), request.expiresIn),
        };
      } catch (error) {
        return normalizeStorageFailure("Failed to create presigned download URL", error, { key: request.key });
      }
    },
    async statObject(key): Promise<StoredObjectStat | null> {
      try {
        const file = getClient().file(key);
        const exists = await file.exists();
        if (!exists) {
          return null;
        }

        const stat = await file.stat();
        return {
          etag: stat.etag,
          size: stat.size,
          contentType: stat.type,
          lastModified: stat.lastModified,
        };
      } catch (error) {
        return normalizeStorageFailure("Failed to stat object", error, { key });
      }
    },
    async deleteObject(key) {
      try {
        await getClient().file(key).delete();
      } catch (error) {
        return normalizeStorageFailure("Failed to delete object", error, { key });
      }
    },
  };
};
