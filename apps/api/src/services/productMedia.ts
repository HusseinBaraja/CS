import { ERROR_CODES, type ErrorCode } from '@cs/shared';
import type { ProductImageDto } from './products';

export interface CreateProductImageUploadInput {
  contentType: string;
  sizeBytes: number;
  alt?: string;
}

export interface CreateProductImageUploadResult {
  uploadId: string;
  imageId: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  method: "PUT";
  contentType: string;
  maxSizeBytes: number;
}

export interface DeleteProductImageResult {
  productId: string;
  imageId: string;
  objectKey: string;
}

export interface ProductMediaService {
  /**
   * Returns null when the parent product does not exist for the company scope.
   */
  createUpload(
    companyId: string,
    productId: string,
    input: CreateProductImageUploadInput,
  ): Promise<CreateProductImageUploadResult | null>;
  /**
   * Returns null when the upload session does not exist for the scoped product.
   * Throws ProductMediaServiceError(NOT_FOUND) when the parent product is missing.
   */
  completeUpload(
    companyId: string,
    productId: string,
    uploadId: string,
  ): Promise<ProductImageDto | null>;
  /**
   * Returns null when the parent product does not exist for the company scope.
   * Throws ProductMediaServiceError(NOT_FOUND) when the image is missing.
   */
  deleteImage(
    companyId: string,
    productId: string,
    imageId: string,
  ): Promise<DeleteProductImageResult | null>;
}

export class ProductMediaServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 404 | 503;

  constructor(code: ErrorCode, message: string, status: 400 | 404 | 503) {
    super(message);
    this.name = "ProductMediaServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createProductMediaValidationError = (message: string): ProductMediaServiceError =>
  new ProductMediaServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createProductMediaNotFoundError = (message: string): ProductMediaServiceError =>
  new ProductMediaServiceError(ERROR_CODES.NOT_FOUND, message, 404);

export const createProductMediaStorageError = (message: string): ProductMediaServiceError =>
  new ProductMediaServiceError(ERROR_CODES.STORAGE_FAILED, message, 503);

export const createProductMediaConfigError = (message: string): ProductMediaServiceError =>
  new ProductMediaServiceError(ERROR_CODES.CONFIG_MISSING, message, 503);

export const createProductMediaDatabaseError = (message: string): ProductMediaServiceError =>
  new ProductMediaServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
