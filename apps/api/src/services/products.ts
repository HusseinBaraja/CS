import { ERROR_CODES } from '@cs/shared';

export type ProductSpecifications = Record<string, string | number | boolean>;

export interface ProductVariantDto {
  id: string;
  productId: string;
  variantLabel: string;
  attributes: ProductSpecifications;
  priceOverride?: number;
}

export interface ProductListItemDto {
  id: string;
  companyId: string;
  categoryId: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: ProductSpecifications;
  basePrice?: number;
  baseCurrency?: string;
  imageUrls?: string[];
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
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: ProductSpecifications;
  basePrice?: number;
  baseCurrency?: string;
  imageUrls?: string[];
}

export interface UpdateProductInput {
  categoryId?: string;
  nameEn?: string;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  specifications?: ProductSpecifications | null;
  basePrice?: number | null;
  baseCurrency?: string | null;
  imageUrls?: string[] | null;
}

export interface DeleteProductResult {
  productId: string;
}

export interface ProductsService {
  list(companyId: string, filters: ListProductsFilters): Promise<ProductListItemDto[] | null>;
  get(companyId: string, productId: string): Promise<ProductDetailDto | null>;
  create(companyId: string, input: CreateProductInput): Promise<ProductDetailDto>;
  update(companyId: string, productId: string, patch: UpdateProductInput): Promise<ProductDetailDto | null>;
  delete(companyId: string, productId: string): Promise<DeleteProductResult | null>;
}

export class ProductsServiceError extends Error {
  readonly code: string;
  readonly status: 400 | 404 | 503;

  constructor(
    code: string,
    message: string,
    status: 400 | 404 | 503,
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

export const createAiServiceError = (message: string): ProductsServiceError =>
  new ProductsServiceError(ERROR_CODES.AI_PROVIDER_FAILED, message, 503);

export const createDatabaseServiceError = (message: string): ProductsServiceError =>
  new ProductsServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
