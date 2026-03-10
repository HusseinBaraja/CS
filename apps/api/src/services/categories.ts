import { ERROR_CODES } from '@cs/shared';

export interface CategoryDto {
  id: string;
  companyId: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
}

export interface CreateCategoryInput {
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
}

export interface UpdateCategoryInput {
  nameEn?: string;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
}

export interface DeleteCategoryResult {
  categoryId: string;
}

export interface CategoriesService {
  list(companyId: string): Promise<CategoryDto[] | null>;
  get(companyId: string, categoryId: string): Promise<CategoryDto | null>;
  create(companyId: string, input: CreateCategoryInput): Promise<CategoryDto | null>;
  update(companyId: string, categoryId: string, patch: UpdateCategoryInput): Promise<CategoryDto | null>;
  delete(companyId: string, categoryId: string): Promise<DeleteCategoryResult | null>;
}

export class CategoriesServiceError extends Error {
  readonly code: string;
  readonly status: 400 | 409 | 503;

  constructor(
    code: string,
    message: string,
    status: 400 | 409 | 503,
  ) {
    super(message);
    this.name = "CategoriesServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createValidationServiceError = (message: string): CategoriesServiceError =>
  new CategoriesServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createConflictServiceError = (message: string): CategoriesServiceError =>
  new CategoriesServiceError(ERROR_CODES.CONFLICT, message, 409);

export const createDatabaseServiceError = (message: string): CategoriesServiceError =>
  new CategoriesServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
