import { convexApi, createConvexClient } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import type { DeleteProductResult, ProductsService, ProductsServiceError } from './products';
import {
  createAiServiceError,
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
} from './products';

type ConvexClient = ReturnType<typeof createConvexClient>;

export interface ConvexProductsServiceOptions {
  createClient?: () => ConvexClient;
}

const ERROR_PREFIXES = new Map<string, (message: string) => ProductsServiceError>([
  [ERROR_CODES.AI_PROVIDER_FAILED, createAiServiceError],
  [ERROR_CODES.NOT_FOUND, createNotFoundServiceError],
  [ERROR_CODES.VALIDATION_FAILED, createValidationServiceError],
]);

const parseTaggedError = (message: string): ProductsServiceError | null => {
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

const normalizeServiceError = (error: unknown): ProductsServiceError => {
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
      return createValidationServiceError("Invalid product, company, or category identifier");
    }
  }

  return createDatabaseServiceError("Product data is temporarily unavailable");
};

export const createConvexProductsService = (
  options: ConvexProductsServiceOptions = {},
): ProductsService => {
  const createClient = options.createClient ?? createConvexClient;

  const withClient = async <T>(callback: (client: ConvexClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    list: (companyId, filters) =>
      withClient((client) =>
        client.query(convexApi.products.list, {
          companyId: companyId as never,
          ...(filters.categoryId ? { categoryId: filters.categoryId as never } : {}),
          ...(filters.search ? { search: filters.search } : {}),
        })
      ),
    get: (companyId, productId) =>
      withClient((client) =>
        client.query(convexApi.products.get, {
          companyId: companyId as never,
          productId: productId as never,
        })
      ),
    create: (companyId, input) =>
      withClient((client) => {
        const {
          categoryId,
          ...restInput
        } = input;

        return client.action(convexApi.products.create, {
          companyId: companyId as never,
          ...restInput,
          categoryId: categoryId as never,
        });
      }),
    update: (companyId, productId, patch) =>
      withClient((client) => {
        const {
          categoryId,
          ...restPatch
        } = patch;

        return client.action(convexApi.products.update, {
          companyId: companyId as never,
          productId: productId as never,
          ...restPatch,
          ...(categoryId ? { categoryId: categoryId as never } : {}),
        });
      }),
    delete: (companyId, productId) =>
      withClient((client) =>
        client.mutation(convexApi.products.remove, {
          companyId: companyId as never,
          productId: productId as never,
        })
      ) as Promise<DeleteProductResult | null>,
  };
};
