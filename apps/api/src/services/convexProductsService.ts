import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import {
  createAiServiceError,
  createConflictServiceError,
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
  type DeleteProductResult,
  type ProductsService,
  ProductsServiceError,
} from './products';

export interface ConvexProductsServiceOptions {
  createClient?: () => ConvexAdminClient;
}

const ERROR_PREFIXES = new Map<string, (message: string) => ProductsServiceError>([
  [ERROR_CODES.AI_PROVIDER_FAILED, createAiServiceError],
  [ERROR_CODES.CONFLICT, createConflictServiceError],
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

const isProductsServiceError = (error: unknown): error is ProductsServiceError =>
  error instanceof ProductsServiceError;

const normalizeServiceError = (error: unknown): ProductsServiceError => {
  if (isProductsServiceError(error)) {
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
      return createValidationServiceError("Invalid product, company, category, or variant identifier");
    }
  }

  return createDatabaseServiceError("Product data is temporarily unavailable");
};

export const createConvexProductsService = (
  options: ConvexProductsServiceOptions = {},
): ProductsService => {
  const createClient = options.createClient ?? createConvexAdminClient;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    list: (companyId, filters) =>
      withClient((client) =>
        client.query(convexInternal.products.list, {
          companyId: companyId as never,
          ...(filters.categoryId ? { categoryId: filters.categoryId as never } : {}),
          ...(filters.search ? { search: filters.search } : {}),
        })
      ),
    get: (companyId, productId) =>
      withClient((client) =>
        client.query(convexInternal.products.get, {
          companyId: companyId as never,
          productId: productId as never,
        })
      ),
    listVariants: (companyId, productId) =>
      withClient((client) =>
        client.query(convexInternal.products.listVariants, {
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

        return client.action(convexInternal.products.create, {
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

        return client.action(convexInternal.products.update, {
          companyId: companyId as never,
          productId: productId as never,
          ...restPatch,
          ...(categoryId ? { categoryId: categoryId as never } : {}),
        });
      }),
    createVariant: (companyId, productId, input) =>
      withClient((client) =>
        client.action(convexInternal.products.createVariant, {
          companyId: companyId as never,
          productId: productId as never,
          ...input,
        })
      ),
    updateVariant: (companyId, productId, variantId, patch) =>
      withClient((client) =>
        client.action(convexInternal.products.updateVariant, {
          companyId: companyId as never,
          productId: productId as never,
          variantId: variantId as never,
          ...patch,
        })
      ),
    deleteVariant: (companyId, productId, variantId) =>
      withClient((client) =>
        client.action(convexInternal.products.removeVariant, {
          companyId: companyId as never,
          productId: productId as never,
          variantId: variantId as never,
        })
      ),
    delete: (companyId, productId) =>
      withClient((client) =>
        client.mutation(convexInternal.products.remove, {
          companyId: companyId as never,
          productId: productId as never,
        })
      ) as Promise<DeleteProductResult | null>,
  };
};
