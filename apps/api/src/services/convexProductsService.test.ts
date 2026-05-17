import { describe, expect, test } from 'bun:test';
import { convexInternal } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import { getFunctionName } from 'convex/server';
import { createConvexProductsService } from './convexProductsService';
import {
  createAiServiceError,
  createConflictServiceError,
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
  ProductsServiceError,
} from './products';

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient) =>
  createConvexProductsService({
    createClient: () => client as never,
  });

describe('createConvexProductsService', () => {
  test('uses internal Convex product references', async () => {
    let receivedReference: unknown;
    const service = createService({
      query: async (reference) => {
        receivedReference = reference;
        return [];
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });

    await expect(service.list('company-1', {})).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.list),
    );
  });

  test('passes fixed product fields to create and update actions', async () => {
    const calls: Array<{ reference: unknown; args: unknown }> = [];
    const service = createService({
      query: async () => {
        throw new Error('query should not be called');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async (reference, args) => {
        calls.push({ reference, args });
        return {
          id: 'product-1',
          companyId: 'company-1',
          categoryId: 'category-1',
          nameAr: 'علبة',
          price: 1.25,
          currency: 'SAR',
          variants: [],
        };
      },
    });

    await service.create('company-1', {
      categoryId: 'category-1',
      productNo: 'P-1',
      nameAr: 'علبة',
      price: 1.25,
      currency: 'SAR',
      primaryImage: 'image-key',
    });
    await service.update('company-1', 'product-1', {
      categoryId: 'category-2',
      productNo: null,
      price: null,
      currency: null,
    });

    expect(getFunctionName(calls[0]?.reference as never)).toBe(
      getFunctionName(convexInternal.products.create),
    );
    expect(calls[0]?.args).toEqual({
      companyId: 'company-1',
      categoryId: 'category-1',
      productNo: 'P-1',
      nameAr: 'علبة',
      price: 1.25,
      currency: 'SAR',
      primaryImage: 'image-key',
    });
    expect(getFunctionName(calls[1]?.reference as never)).toBe(
      getFunctionName(convexInternal.products.update),
    );
    expect(calls[1]?.args).toEqual({
      companyId: 'company-1',
      productId: 'product-1',
      categoryId: 'category-2',
      productNo: null,
      price: null,
      currency: null,
    });
  });

  test('uses label and price for variant actions', async () => {
    const calls: Array<{ reference: unknown; args: unknown }> = [];
    const service = createService({
      query: async () => {
        throw new Error('query should not be called');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async (reference, args) => {
        calls.push({ reference, args });
        return {
          id: 'variant-1',
          companyId: 'company-1',
          productId: 'product-1',
          labelEn: 'Large',
          price: 1.5,
        };
      },
    });

    await expect(service.createVariant('company-1', 'product-1', {
      labelEn: 'Large',
      price: 1.5,
    })).resolves.toEqual({
      id: 'variant-1',
      companyId: 'company-1',
      productId: 'product-1',
      labelEn: 'Large',
      price: 1.5,
    });
    await service.updateVariant('company-1', 'product-1', 'variant-1', {
      labelEn: 'Small',
      price: null,
    });

    expect(getFunctionName(calls[0]?.reference as never)).toBe(
      getFunctionName(convexInternal.products.createVariant),
    );
    expect(calls[0]?.args).toEqual({
      companyId: 'company-1',
      productId: 'product-1',
      labelEn: 'Large',
      price: 1.5,
    });
    expect(getFunctionName(calls[1]?.reference as never)).toBe(
      getFunctionName(convexInternal.products.updateVariant),
    );
    expect(calls[1]?.args).toEqual({
      companyId: 'company-1',
      productId: 'product-1',
      variantId: 'variant-1',
      labelEn: 'Small',
      price: null,
    });
  });

  test('uses the internal removeVariant action reference', async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async () => {
        throw new Error('query should not be called');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return {
          productId: 'product-1',
          variantId: 'variant-1',
        };
      },
    });

    await expect(service.deleteVariant('company-1', 'product-1', 'variant-1')).resolves.toEqual({
      productId: 'product-1',
      variantId: 'variant-1',
    });
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.removeVariant),
    );
    expect(receivedArgs).toEqual({
      companyId: 'company-1',
      productId: 'product-1',
      variantId: 'variant-1',
    });
  });

  test('normalizes service errors', async () => {
    const existingError = new ProductsServiceError(ERROR_CODES.NOT_FOUND, 'Product not found', 404);
    const existingService = createService({
      query: async () => {
        throw existingError;
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });
    await expect(existingService.list('company-1', {})).rejects.toBe(existingError);

    const taggedService = createService({
      query: async () => {
        throw new Error('AI_PROVIDER_FAILED: Gemini rate limit exceeded');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });
    await expect(taggedService.list('company-1', {})).rejects.toEqual(
      createAiServiceError('Gemini rate limit exceeded'),
    );

    const validationService = createService({
      query: async () => {
        throw new Error('ArgumentValidationError: Unable to decode value');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });
    await expect(validationService.list('company-1', {})).rejects.toEqual(
      createValidationServiceError('Invalid product, company, category, or variant identifier'),
    );

    const unknownService = createService({
      query: async () => {
        throw new Error('socket hang up');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async () => {
        throw new Error('action should not be called');
      },
    });
    await expect(unknownService.list('company-1', {})).rejects.toEqual(
      createDatabaseServiceError('Product data is temporarily unavailable'),
    );
  });

  test('maps not-found and conflict action tags', async () => {
    const notFoundService = createService({
      query: async () => {
        throw new Error('query should not be called');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async () => {
        throw new Error('NOT_FOUND: Category not found');
      },
    });
    await expect(notFoundService.create('company-1', {
      categoryId: 'category-1',
      nameEn: 'Burger Box',
    })).rejects.toEqual(createNotFoundServiceError('Category not found'));

    const conflictService = createService({
      query: async () => {
        throw new Error('query should not be called');
      },
      mutation: async () => {
        throw new Error('mutation should not be called');
      },
      action: async () => {
        throw new Error('CONFLICT: Product was modified concurrently; retry the update');
      },
    });
    await expect(conflictService.update('company-1', 'product-1', {
      nameEn: 'Updated Burger Box',
    })).rejects.toEqual(
      createConflictServiceError('Product was modified concurrently; retry the update'),
    );
  });
});
