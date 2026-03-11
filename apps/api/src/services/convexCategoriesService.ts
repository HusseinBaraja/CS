import { convexApi, createConvexClient } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import {
  CategoriesServiceError,
  type CategoriesService,
  type DeleteCategoryResult,
  createConflictServiceError,
  createDatabaseServiceError,
  createValidationServiceError,
} from './categories';

type ConvexClient = ReturnType<typeof createConvexClient>;

export interface ConvexCategoriesServiceOptions {
  createClient?: () => ConvexClient;
}

const ERROR_PREFIXES = new Map<string, (message: string) => CategoriesServiceError>([
  [ERROR_CODES.CONFLICT, createConflictServiceError],
  [ERROR_CODES.VALIDATION_FAILED, createValidationServiceError],
]);

const parseTaggedError = (message: string): CategoriesServiceError | null => {
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

const isCategoriesServiceError = (error: unknown): error is CategoriesServiceError =>
  error instanceof CategoriesServiceError;

const normalizeServiceError = (error: unknown): CategoriesServiceError => {
  if (isCategoriesServiceError(error)) {
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
      return createValidationServiceError("Invalid company or category identifier");
    }
  }

  return createDatabaseServiceError("Category data is temporarily unavailable");
};

export const createConvexCategoriesService = (
  options: ConvexCategoriesServiceOptions = {},
): CategoriesService => {
  const createClient = options.createClient ?? createConvexClient;

  const withClient = async <T>(callback: (client: ConvexClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    list: (companyId) =>
      withClient((client) =>
        client.query(convexApi.categories.list, {
          companyId: companyId as never,
        })
      ),
    get: (companyId, categoryId) =>
      withClient((client) =>
        client.query(convexApi.categories.get, {
          companyId: companyId as never,
          categoryId: categoryId as never,
        })
      ),
    create: (companyId, input) =>
      withClient((client) =>
        client.mutation(convexApi.categories.create, {
          companyId: companyId as never,
          ...input,
        })
      ),
    update: (companyId, categoryId, patch) =>
      withClient((client) =>
        client.mutation(convexApi.categories.update, {
          companyId: companyId as never,
          categoryId: categoryId as never,
          ...patch,
        })
      ),
    delete: (companyId, categoryId) =>
      withClient((client) =>
        client.mutation(convexApi.categories.remove, {
          companyId: companyId as never,
          categoryId: categoryId as never,
        })
      ) as Promise<DeleteCategoryResult | null>,
  };
};
