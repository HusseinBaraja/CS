import { ERROR_CODES, type ErrorCode } from '@cs/shared';

export type CompanyConfig = Record<string, string | number | boolean>;

export interface CompanyDto {
  id: string;
  name: string;
  ownerPhone: string;
  timezone?: string;
  config?: CompanyConfig;
}

export interface CreateCompanyInput {
  name: string;
  ownerPhone: string;
  timezone?: string;
  config?: CompanyConfig;
}

export interface UpdateCompanyInput {
  name?: string;
  ownerPhone?: string;
  timezone?: string | null;
  config?: CompanyConfig | null;
}

export interface DeleteCompanyCounts {
  companies: number;
  botRuntimeSessions: number;
  categories: number;
  products: number;
  productImageUploads: number;
  productVariants: number;
  embeddings: number;
  conversations: number;
  messages: number;
  mediaCleanupJobs: number;
  offers: number;
  currencyRates: number;
  analyticsEvents: number;
}

export interface DeleteCompanyResult {
  companyId: string;
  counts: DeleteCompanyCounts;
}

export interface CompaniesService {
  list(): Promise<CompanyDto[]>;
  get(companyId: string): Promise<CompanyDto | null>;
  create(input: CreateCompanyInput): Promise<CompanyDto>;
  update(companyId: string, patch: UpdateCompanyInput): Promise<CompanyDto | null>;
  delete(companyId: string): Promise<DeleteCompanyResult | null>;
}

export class CompaniesServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 409 | 503;

  constructor(
    code: ErrorCode,
    message: string,
    status: 400 | 409 | 503,
  ) {
    super(message);
    this.name = "CompaniesServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createValidationServiceError = (message: string): CompaniesServiceError =>
  new CompaniesServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createConflictServiceError = (message: string): CompaniesServiceError =>
  new CompaniesServiceError(ERROR_CODES.CONFLICT, message, 409);

export const createDatabaseServiceError = (message: string): CompaniesServiceError =>
  new CompaniesServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
