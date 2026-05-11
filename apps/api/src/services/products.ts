import { ERROR_CODES, type ErrorCode } from '@cs/shared';

export interface ProductVariantDto {
  id: string;
  companyId: string;
  productId: string;
  label: string;
  price?: number;
}

export interface ProductListItemDto {
  id: string;
  companyId: string;
  categoryId: string;
  productNo?: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
  primaryImage?: string;
}

export interface ProductDetailDto extends ProductListItemDto {
  variants: ProductVariantDto[];
}

export interface ListProductsFilters {
  categoryId?: string;
  search?: string;
}

export interface CreateProductInput {
  categoryId: string;
  productNo?: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
  primaryImage?: string;
}

export interface UpdateProductInput {
  categoryId?: string;
  productNo?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  price?: number | null;
  currency?: string | null;
  primaryImage?: string | null;
}

export interface DeleteProductResult {
  productId: string;
}

export interface CreateProductVariantInput {
  label: string;
  price?: number;
}

export interface UpdateProductVariantInput {
  label?: string;
  price?: number | null;
}

export interface DeleteProductVariantResult {
  productId: string;
  variantId: string;
}

export interface ProductsService {
  list(companyId: string, filters: ListProductsFilters): Promise<ProductListItemDto[] | null>;
  get(companyId: string, productId: string): Promise<ProductDetailDto | null>;
  create(companyId: string, input: CreateProductInput): Promise<ProductDetailDto>;
  update(companyId: string, productId: string, patch: UpdateProductInput): Promise<ProductDetailDto | null>;
  delete(companyId: string, productId: string): Promise<DeleteProductResult | null>;
  listVariants(companyId: string, productId: string): Promise<ProductVariantDto[] | null>;
  /**
   * Returns null when the parent product does not exist for the company scope.
   */
  createVariant(
    companyId: string,
    productId: string,
    input: CreateProductVariantInput,
  ): Promise<ProductVariantDto | null>;
  /**
   * Returns null when the parent product does not exist for the company scope.
   * Throws ProductsServiceError(NOT_FOUND) when the variant is missing.
   */
  updateVariant(
    companyId: string,
    productId: string,
    variantId: string,
    patch: UpdateProductVariantInput,
  ): Promise<ProductVariantDto | null>;
  /**
   * Returns null when the parent product does not exist for the company scope.
   * Throws ProductsServiceError(NOT_FOUND) when the variant is missing.
   */
  deleteVariant(
    companyId: string,
    productId: string,
    variantId: string,
  ): Promise<DeleteProductVariantResult | null>;
}

export class ProductsServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 404 | 409 | 503;

  constructor(
    code: ErrorCode,
    message: string,
    status: 400 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ProductsServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createValidationServiceError = (message: string): ProductsServiceError =>
  new ProductsServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createNotFoundServiceError = (message: string): ProductsServiceError =>
  new ProductsServiceError(ERROR_CODES.NOT_FOUND, message, 404);

export const createConflictServiceError = (message: string): ProductsServiceError =>
  new ProductsServiceError(ERROR_CODES.CONFLICT, message, 409);

export const createAiServiceError = (message: string): ProductsServiceError =>
  new ProductsServiceError(ERROR_CODES.AI_PROVIDER_FAILED, message, 503);

export const createDatabaseServiceError = (message: string): ProductsServiceError =>
  new ProductsServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
