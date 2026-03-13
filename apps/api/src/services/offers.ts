import { ERROR_CODES, type ErrorCode } from '@cs/shared';

export interface OfferDto {
  id: string;
  companyId: string;
  contentEn: string;
  contentAr?: string;
  active: boolean;
  startDate?: string;
  endDate?: string;
  isCurrentlyActive: boolean;
}

export interface ListOffersFilters {
  activeOnly?: boolean;
}

export interface CreateOfferInput {
  contentEn: string;
  contentAr?: string;
  active: boolean;
  startDate?: string;
  endDate?: string;
}

export interface UpdateOfferInput {
  contentEn?: string;
  contentAr?: string | null;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface DeleteOfferResult {
  offerId: string;
}

export interface OffersService {
  list(companyId: string, filters: ListOffersFilters): Promise<OfferDto[] | null>;
  create(companyId: string, input: CreateOfferInput): Promise<OfferDto | null>;
  update(companyId: string, offerId: string, patch: UpdateOfferInput): Promise<OfferDto | null>;
  delete(companyId: string, offerId: string): Promise<DeleteOfferResult | null>;
}

export class OffersServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 404 | 503;

  constructor(
    code: ErrorCode,
    message: string,
    status: 400 | 404 | 503,
  ) {
    super(message);
    this.name = "OffersServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createValidationServiceError = (message: string): OffersServiceError =>
  new OffersServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createNotFoundServiceError = (message: string): OffersServiceError =>
  new OffersServiceError(ERROR_CODES.NOT_FOUND, message, 404);

export const createDatabaseServiceError = (message: string): OffersServiceError =>
  new OffersServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);
