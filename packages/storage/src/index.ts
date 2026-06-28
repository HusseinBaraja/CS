import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
  }) => R2StorageClient;
  now?: () => number;
}

interface R2StorageClient {
  createPresignedUpload(input: {
    key: string;
    contentType: AllowedProductImageMimeType;
    expiresIn: number;
  }): Promise<string>;
  createPresignedDownload(input: { key: string; expiresIn: number }): Promise<string>;
  statObject(key: string): Promise<StoredObjectStat | null>;
  deleteObject(key: string): Promise<void>;
}

export class StorageError extends AppError {
  constructor(message: string, options: { cause?: unknown; context?: Record<string, unknown> } = {}) {
    super(ERROR_CODES.STORAGE_FAILED, message, options);
  }
}

const toIsoExpiry = (now: number, expiresIn: number) => new Date(now + expiresIn * 1000).toISOString();

const OBJECT_NOT_FOUND_ERROR_NAMES = new Set(["NoSuchKey", "NotFound"]);

export const isExplicitObjectNotFoundError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return false;
  }

  const metadata = error.$metadata as { httpStatusCode?: number };
  if (metadata.httpStatusCode !== 404) {
    return false;
  }

  const candidate = error as { Code?: unknown; code?: unknown; name?: unknown };

  return [candidate.Code, candidate.code, candidate.name].some(
    (value) => typeof value === "string" && OBJECT_NOT_FOUND_ERROR_NAMES.has(value),
  );
};

const createDefaultStorageClient: NonNullable<R2StorageOptions["createClient"]> = (options) => {
  const clientConfig: S3ClientConfig = {
    endpoint: options.endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  };
  const client = new S3Client(clientConfig);

  return {
    createPresignedUpload: ({ key, contentType, expiresIn }) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn },
      ),
    createPresignedDownload: ({ key, expiresIn }) =>
      getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: options.bucket,
          Key: key,
        }),
        { expiresIn },
      ),
    async statObject(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({
            Bucket: options.bucket,
            Key: key,
          }),
        );

        return {
          etag: result.ETag,
          size: result.ContentLength ?? 0,
          contentType: result.ContentType,
          lastModified: result.LastModified,
        };
      } catch (error) {
        if (isExplicitObjectNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    deleteObject: async (key) => {
      await client.send(
        new DeleteObjectCommand({
          Bucket: options.bucket,
          Key: key,
        }),
      );
    },
  };
};

const createStorageClient = (
  runtimeEnv: Record<string, string | number | boolean | undefined> = process.env,
  createClient: NonNullable<R2StorageOptions["createClient"]> = createDefaultStorageClient,
): R2StorageClient => {
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
  let client: R2StorageClient | undefined;

  const getClient = () => {
    client ??= createStorageClient(process.env, options.createClient);
    return client;
  };

  return {
    async createPresignedUpload(request): Promise<{ url: string; expiresAt: string }> {
      try {
        const url = await getClient().createPresignedUpload(request);

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
        const url = await getClient().createPresignedDownload(request);

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
        return await getClient().statObject(key);
      } catch (error) {
        return normalizeStorageFailure("Failed to stat object", error, { key });
      }
    },
    async deleteObject(key) {
      try {
        await getClient().deleteObject(key);
      } catch (error) {
        return normalizeStorageFailure("Failed to delete object", error, { key });
      }
    },
  };
};
