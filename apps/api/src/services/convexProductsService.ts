import {
  type ConvexAdminClient,
  ConvexIdValidationError,
  convexInternal,
  createConvexAdminClient,
  toCategoryId,
  toCompanyId,
  toProductId,
  toVariantId,
} from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import {
  createAiServiceError,
  createConflictServiceError,
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
  type DeleteProductResult,
  type ProductDetailDto,
  type ProductListItemDto,
  type ProductsService,
  ProductsServiceError,
} from './products';

interface ConvexProductsServiceOptions {
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
    if (error instanceof ConvexIdValidationError) {
      return createValidationServiceError("Invalid product, company, category, or variant identifier");
    }

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
      withClient(async (client) => {
        const products = await client.query(convexInternal.products.list, {
          companyId: toCompanyId(companyId),
          ...(filters.categoryId ? { categoryId: toCategoryId(filters.categoryId) } : {}),
          ...(filters.search ? { search: filters.search } : {}),
        });

        return products;
      }),
    get: (companyId, productId) =>
      withClient(async (client) => {
        const product = await client.query(convexInternal.products.get, {
          companyId: toCompanyId(companyId),
          productId: toProductId(productId),
        });

        return product;
      }),
    listVariants: (companyId, productId) =>
      withClient((client) =>
        client.query(convexInternal.products.listVariants, {
          companyId: toCompanyId(companyId),
          productId: toProductId(productId),
        })
      ),
    create: (companyId, input) =>
      withClient(async (client) => {
        const {
          categoryId,
          ...restInput
        } = input;

        return client.action(convexInternal.products.create, {
          companyId: toCompanyId(companyId),
          ...restInput,
          categoryId: toCategoryId(categoryId),
        });
      }),
    update: (companyId, productId, patch) =>
      withClient(async (client) => {
        const {
          categoryId,
          ...restPatch
        } = patch;

        return client.action(convexInternal.products.update, {
          companyId: toCompanyId(companyId),
          productId: toProductId(productId),
          ...restPatch,
          ...(categoryId ? { categoryId: toCategoryId(categoryId) } : {}),
        });
      }),
    createVariant: (companyId, productId, input) =>
      withClient((client) =>
        client.action(convexInternal.products.createVariant, {
          companyId: toCompanyId(companyId),
          productId: toProductId(productId),
          ...input,
        })
      ),
    updateVariant: (companyId, productId, variantId, patch) =>
      withClient((client) =>
        client.action(convexInternal.products.updateVariant, {
          companyId: toCompanyId(companyId),
          productId: toProductId(productId),
          variantId: toVariantId(variantId),
          ...patch,
        })
      ),
    deleteVariant: (companyId, productId, variantId) =>
      withClient((client) =>
        client.action(convexInternal.products.removeVariant, {
          companyId: toCompanyId(companyId),
          productId: toProductId(productId),
          variantId: toVariantId(variantId),
        })
      ),
    delete: (companyId, productId) =>
      withClient((client) =>
        client.mutation(convexInternal.products.remove, {
          companyId: toCompanyId(companyId),
          productId: toProductId(productId),
        })
      ) as Promise<DeleteProductResult | null>,
  };
};
