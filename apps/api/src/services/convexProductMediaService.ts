import {
  createR2Storage, type ObjectStorage,
  PRODUCT_IMAGE_ALLOWED_MIME_TYPES,
  PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
  PRODUCT_IMAGE_MAX_SIZE_BYTES,
  PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
  StorageError,
} from '@cs/storage';
import { logEvent, logger as defaultLogger, serializeErrorForLog, type StructuredLogger } from '@cs/core';
import { ConfigError, ERROR_CODES, type ErrorCode } from '@cs/shared';
import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import {
  type CreateProductImageUploadResult,
  type ProductImageDto,
  createProductMediaConfigError,
  createProductMediaDatabaseError,
  createProductMediaNotFoundError,
  createProductMediaStorageError,
  createProductMediaValidationError,
  type ProductMediaService,
  ProductMediaServiceError,
} from './productMedia';

type ProductMediaLogger = StructuredLogger;

interface ConvexProductMediaServiceOptions {
  createClient?: () => ConvexAdminClient;
  createStorage?: () => ObjectStorage;
  logger?: ProductMediaLogger;
  now?: () => number;
}

const TAGGED_ERROR_CODES = new Map<ErrorCode, (message: string) => ProductMediaServiceError>([
  [ERROR_CODES.NOT_FOUND, createProductMediaNotFoundError],
  [ERROR_CODES.VALIDATION_FAILED, createProductMediaValidationError],
]);

const parseTaggedError = (message: string): ProductMediaServiceError | null => {
  for (const [code, createError] of TAGGED_ERROR_CODES) {
    const marker = `${code}:`;
    const index = message.indexOf(marker);
    if (index >= 0) {
      const parsedMessage = message.slice(index + marker.length).trim() || "Request failed";
      return createError(parsedMessage);
    }
  }

  return null;
};

const isProductMediaServiceError = (error: unknown): error is ProductMediaServiceError =>
  error instanceof ProductMediaServiceError;

const isStorageSetupError = (error: unknown): error is ConfigError | StorageError =>
  error instanceof ConfigError || error instanceof StorageError;

const maybeDecorateImage = async (
  storage: ObjectStorage,
  image: ProductImageDto,
): Promise<ProductImageDto> => {
  try {
    const download = await storage.createPresignedDownload({
      key: image.key,
      expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
    });

    return {
      ...image,
      downloadUrl: download.url,
      downloadUrlExpiresAt: download.expiresAt,
    };
  } catch {
    return image;
  }
};

const normalizeError = (error: unknown): ProductMediaServiceError => {
  if (isProductMediaServiceError(error)) {
    return error;
  }

  if (error instanceof ConfigError) {
    return createProductMediaConfigError("Product media storage is not configured");
  }

  if (error instanceof StorageError) {
    return createProductMediaStorageError("Product media storage is temporarily unavailable");
  }

  if (error instanceof Error) {
    const taggedError = parseTaggedError(error.message);
    if (taggedError) {
      return taggedError;
    }

    if (
      error.message.includes("ArgumentValidationError") ||
      error.message.includes("Value does not match validator") ||
      error.message.includes("Invalid argument") ||
      error.message.includes("Unable to decode")
    ) {
      return createProductMediaValidationError("Invalid company, product, image, or upload identifier");
    }
  }

  return createProductMediaDatabaseError("Product media is temporarily unavailable");
};

export const createConvexProductMediaService = (
  options: ConvexProductMediaServiceOptions = {},
): ProductMediaService => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const createStorage = options.createStorage ?? createR2Storage;
  const logger = options.logger ?? defaultLogger;
  const now = options.now ?? Date.now;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeError(error);
    }
  };

  return {
    createUpload: (companyId, productId, input) =>
      withClient(async (client) => {
        const normalizedContentType = input.contentType.trim().toLowerCase();
        if (!PRODUCT_IMAGE_ALLOWED_MIME_TYPES.includes(normalizedContentType as never)) {
          throw createProductMediaValidationError(
            `contentType must be one of: ${PRODUCT_IMAGE_ALLOWED_MIME_TYPES.join(", ")}`,
          );
        }

        if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
          throw createProductMediaValidationError(
            `sizeBytes must be between 1 and ${PRODUCT_IMAGE_MAX_SIZE_BYTES}`,
          );
        }

        const currentTime = now();
        const uploadSession = await client.mutation(convexInternal.productMedia.createUploadSession, {
          companyId: companyId as never,
          productId: productId as never,
          contentType: normalizedContentType,
          ...(input.alt?.trim() ? { alt: input.alt.trim() } : {}),
          maxSizeBytes: PRODUCT_IMAGE_MAX_SIZE_BYTES,
          createdAt: currentTime,
          expiresAt: currentTime + PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS * 1000,
        });

        if (!uploadSession) {
          return null;
        }

        let upload: { url: string; expiresAt: string };
        try {
          upload = await createStorage().createPresignedUpload({
            key: uploadSession.objectKey,
            contentType: normalizedContentType as never,
            expiresIn: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
          });
        } catch (error) {
          if (isStorageSetupError(error)) {
            logEvent(
              logger,
              "warn",
              {
                event: "api.product_media.upload_presign_failed",
                runtime: "api",
                surface: "product_media",
                outcome: "pending_cleanup",
                error: serializeErrorForLog(error),
                companyId,
                cleanupDelaySeconds: PRODUCT_IMAGE_UPLOAD_EXPIRY_SECONDS,
                expiresAt: uploadSession.expiresAt,
                imageId: uploadSession.imageId,
                productId,
                objectKey: uploadSession.objectKey,
                uploadId: uploadSession.uploadId,
              },
              "product image upload session left pending after storage presign failure",
            );
          }

          throw error;
        }

        const result: CreateProductImageUploadResult = {
          uploadId: uploadSession.uploadId,
          imageId: uploadSession.imageId,
          objectKey: uploadSession.objectKey,
          uploadUrl: upload.url,
          expiresAt: upload.expiresAt,
          method: "PUT",
          contentType: normalizedContentType,
          maxSizeBytes: PRODUCT_IMAGE_MAX_SIZE_BYTES,
        };

        return result;
      }),
    completeUpload: (companyId, productId, uploadId) =>
      withClient(async (client) => {
        const uploadSession = await client.query(convexInternal.productMedia.getUploadSession, {
          companyId: companyId as never,
          productId: productId as never,
          uploadId: uploadId as never,
        });

        if (!uploadSession) {
          return null;
        }

        const storage = createStorage();
        const stat = await storage.statObject(uploadSession.objectKey);
        if (!stat) {
          throw createProductMediaValidationError("Uploaded object not found");
        }

        const image = await client.mutation(convexInternal.productMedia.completeUploadSession, {
          companyId: companyId as never,
          productId: productId as never,
          uploadId: uploadId as never,
          observedContentType: stat.contentType ?? uploadSession.intendedContentType,
          sizeBytes: stat.size,
          ...(stat.etag ? { etag: stat.etag } : {}),
          completedAt: now(),
        });

        if (!image) {
          return null;
        }

        return maybeDecorateImage(storage, image);
      }),
    deleteImage: (companyId, productId, imageId) =>
      withClient((client) =>
        client.mutation(convexInternal.productMedia.deleteImage, {
          companyId: companyId as never,
          productId: productId as never,
          deletedAt: now(),
        }).then((deleted) =>
          deleted ? { ...deleted, imageId } : null
        )
      ),
  };
};
