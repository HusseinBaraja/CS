import { type ConvexAdminClient, convexInternal, createConvexAdminClient, type Id } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import {
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
  type OfferDto,
  type OffersService,
  OffersServiceError,
} from './offers';

interface ConvexOfferDto {
  id: string;
  companyId: string;
  contentEn: string;
  contentAr?: string;
  active: boolean;
  startDate?: number;
  endDate?: number;
  isCurrentlyActive: boolean;
}

interface ConvexOffersServiceOptions {
  createClient?: () => ConvexAdminClient;
  now?: () => number;
}

const ERROR_PREFIXES = new Map<string, (message: string) => OffersServiceError>([
  [ERROR_CODES.NOT_FOUND, createNotFoundServiceError],
  [ERROR_CODES.VALIDATION_FAILED, createValidationServiceError],
]);

const parseTaggedError = (message: string): OffersServiceError | null => {
  for (const [code, createError] of ERROR_PREFIXES) {
    const marker = `${code}:`;
    const markerIndex = message.indexOf(marker);
    if (markerIndex >= 0) {
      const errorMessage = message.slice(markerIndex + marker.length).trim() || "Request failed";
      return createError(errorMessage);
    }
  }

  return null;
};

const isOffersServiceError = (error: unknown): error is OffersServiceError =>
  error instanceof OffersServiceError;

const normalizeServiceError = (error: unknown): OffersServiceError => {
  if (isOffersServiceError(error)) {
    return error;
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
      return createValidationServiceError("Invalid company or offer identifier");
    }
  }

  return createDatabaseServiceError("Offer data is temporarily unavailable");
};

const toIsoDate = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : new Date(value).toISOString();

const toEpochMillis = (value: string | null | undefined, fieldName: string): number | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw createValidationServiceError(`${fieldName} must be a valid ISO 8601 date-time string`);
  }

  return timestamp;
};

const toCompanyId = (companyId: string): Id<"companies"> =>
  companyId as Id<"companies">;

const toOfferId = (offerId: string): Id<"offers"> =>
  offerId as Id<"offers">;

const mapOffer = (offer: ConvexOfferDto): OfferDto => ({
  id: offer.id,
  companyId: offer.companyId,
  contentEn: offer.contentEn,
  ...(offer.contentAr ? { contentAr: offer.contentAr } : {}),
  active: offer.active,
  ...(offer.startDate !== undefined ? { startDate: toIsoDate(offer.startDate) } : {}),
  ...(offer.endDate !== undefined ? { endDate: toIsoDate(offer.endDate) } : {}),
  isCurrentlyActive: offer.isCurrentlyActive,
});

export const createConvexOffersService = (
  options: ConvexOffersServiceOptions = {},
): OffersService => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const now = options.now ?? Date.now;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    list: (companyId, filters) =>
      withClient(async (client) => {
        const offers = await client.query(convexInternal.offers.list, {
          companyId: toCompanyId(companyId),
          ...(filters.activeOnly !== undefined ? { activeOnly: filters.activeOnly } : {}),
        });

        return offers?.map(mapOffer) ?? null;
      }),
    create: (companyId, input) =>
      withClient(async (client) => {
        const startDate = toEpochMillis(input.startDate, "startDate");
        const endDate = toEpochMillis(input.endDate, "endDate");

        const offer = await client.mutation(convexInternal.offers.create, {
          companyId: toCompanyId(companyId),
          contentEn: input.contentEn,
          ...(input.contentAr !== undefined ? { contentAr: input.contentAr } : {}),
          active: input.active,
          ...(startDate !== undefined && startDate !== null ? { startDate } : {}),
          ...(endDate !== undefined && endDate !== null ? { endDate } : {}),
          now: now(),
        });

        return offer ? mapOffer(offer as ConvexOfferDto) : null;
      }),
    update: (companyId, offerId, patch) =>
      withClient(async (client) => {
        const startDate = toEpochMillis(patch.startDate, "startDate");
        const endDate = toEpochMillis(patch.endDate, "endDate");

        const offer = await client.mutation(convexInternal.offers.update, {
          companyId: toCompanyId(companyId),
          offerId: toOfferId(offerId),
          ...(patch.contentEn !== undefined ? { contentEn: patch.contentEn } : {}),
          ...(patch.contentAr !== undefined ? { contentAr: patch.contentAr } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
          ...(patch.startDate !== undefined ? { startDate } : {}),
          ...(patch.endDate !== undefined ? { endDate } : {}),
          now: now(),
        });

        return offer ? mapOffer(offer as ConvexOfferDto) : null;
      }),
    delete: (companyId, offerId) =>
      withClient((client) =>
        client.mutation(convexInternal.offers.remove, {
          companyId: toCompanyId(companyId),
          offerId: toOfferId(offerId),
        })
      ),
  };
};
