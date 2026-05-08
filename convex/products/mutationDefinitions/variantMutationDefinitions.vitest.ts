/// <reference types='vite/client' />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';

const {
  replaceProductEmbeddingsInMutation,
  refreshCompanyCatalogLanguageHintsInMutation,
  getScopedProduct,
  getScopedVariant,
  assertCurrencyIfPriced,
  normalizeVariantCreateState,
  createVariantPatch,
  mapVariant,
} = vi.hoisted(() => ({
  replaceProductEmbeddingsInMutation: vi.fn(),
  refreshCompanyCatalogLanguageHintsInMutation: vi.fn(),
  getScopedProduct: vi.fn(),
  getScopedVariant: vi.fn(),
  assertCurrencyIfPriced: vi.fn(),
  normalizeVariantCreateState: vi.fn(),
  createVariantPatch: vi.fn(),
  mapVariant: vi.fn(),
}));

vi.mock('../../productEmbeddingRuntime', () => ({
  replaceProductEmbeddingsInMutation,
}));

vi.mock('../../catalogLanguageHints', () => ({
  refreshCompanyCatalogLanguageHintsInMutation,
}));

vi.mock('../readers', () => ({
  getScopedProduct,
  getScopedVariant,
}));

vi.mock('../normalization', () => ({
  assertCurrencyIfPriced,
  normalizeVariantCreateState,
  createVariantPatch,
}));

vi.mock('../mapping', () => ({
  mapVariant,
}));

import {
  insertVariantWithEmbeddingsDefinition,
  patchVariantWithEmbeddingsDefinition,
  removeVariantWithEmbeddingsDefinition,
} from './variantMutationDefinitions';

const COMPANY_ID = 'company_1' as Id<'companies'>;
const PRODUCT_ID = 'product_1' as Id<'products'>;
const VARIANT_ID = 'variant_1' as Id<'productVariants'>;
const EXPECTED_REVISION = 1;

const buildCtx = (): MutationCtx =>
  ({
    db: {
      insert: vi.fn(),
      patch: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
  }) as unknown as MutationCtx;

const EMBEDDING_ARGS = {
  companyId: COMPANY_ID,
  productId: PRODUCT_ID,
  englishEmbedding: [1, 2],
  arabicEmbedding: [3, 4],
  englishText: 'english',
  arabicText: 'arabic',
};

const MUTATION_BASE_ARGS = {
  ...EMBEDDING_ARGS,
  expectedRevision: EXPECTED_REVISION,
};

describe('variant mutation definitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes catalog language hints after creating a variant embedding', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR', version: 1 });
    normalizeVariantCreateState.mockReturnValue({
      productId: PRODUCT_ID,
      label: 'Large',
      price: 10,
    });
    (ctx.db.insert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(VARIANT_ID);
    (ctx.db.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: VARIANT_ID,
      productId: PRODUCT_ID,
      label: 'Large',
      price: 10,
    });
    mapVariant.mockReturnValue({ id: VARIANT_ID });

    await insertVariantWithEmbeddingsDefinition.handler(ctx, {
      ...MUTATION_BASE_ARGS,
      label: 'Large',
    });

    expect(normalizeVariantCreateState).toHaveBeenCalledWith(
      {
        productId: PRODUCT_ID,
        label: 'Large',
        price: undefined,
      },
      'SAR',
    );
    expect(replaceProductEmbeddingsInMutation).toHaveBeenCalledWith(ctx, EMBEDDING_ARGS);
    expect(refreshCompanyCatalogLanguageHintsInMutation).toHaveBeenCalledWith(ctx, COMPANY_ID);
    expect(replaceProductEmbeddingsInMutation.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCompanyCatalogLanguageHintsInMutation.mock.invocationCallOrder[0],
    );
  });

  it('refreshes catalog language hints after patching a variant embedding', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR', version: 1 });
    getScopedVariant.mockResolvedValue({ _id: VARIANT_ID });
    createVariantPatch.mockReturnValue({
      label: 'XL',
      });
    (ctx.db.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: VARIANT_ID,
      productId: PRODUCT_ID,
      label: 'XL',
      });
    mapVariant.mockReturnValue({ id: VARIANT_ID });

    await patchVariantWithEmbeddingsDefinition.handler(ctx, {
      ...MUTATION_BASE_ARGS,
      variantId: VARIANT_ID,
      label: 'XL',
    });

    expect(assertCurrencyIfPriced).toHaveBeenCalledWith(undefined, 'SAR');
    expect(replaceProductEmbeddingsInMutation).toHaveBeenCalledWith(ctx, EMBEDDING_ARGS);
    expect(refreshCompanyCatalogLanguageHintsInMutation).toHaveBeenCalledWith(ctx, COMPANY_ID);
    expect(replaceProductEmbeddingsInMutation.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCompanyCatalogLanguageHintsInMutation.mock.invocationCallOrder[0],
    );
  });

  it('allows clearing a variant price when the product has no currency', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ version: 1 });
    getScopedVariant.mockResolvedValue({ _id: VARIANT_ID, price: 10 });
    createVariantPatch.mockReturnValue({
      price: undefined,
    });
    (ctx.db.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: VARIANT_ID,
      productId: PRODUCT_ID,
      label: 'Large',
    });
    mapVariant.mockReturnValue({ id: VARIANT_ID });

    await patchVariantWithEmbeddingsDefinition.handler(ctx, {
      ...MUTATION_BASE_ARGS,
      variantId: VARIANT_ID,
      price: null,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(VARIANT_ID, { price: undefined });
    expect(replaceProductEmbeddingsInMutation).toHaveBeenCalledWith(ctx, EMBEDDING_ARGS);
  });

  it('refreshes catalog language hints after deleting a variant embedding', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR', version: 1 });
    getScopedVariant.mockResolvedValue({ _id: VARIANT_ID });

    await removeVariantWithEmbeddingsDefinition.handler(ctx, {
      ...MUTATION_BASE_ARGS,
      variantId: VARIANT_ID,
    });

    expect(replaceProductEmbeddingsInMutation).toHaveBeenCalledWith(ctx, EMBEDDING_ARGS);
    expect(refreshCompanyCatalogLanguageHintsInMutation).toHaveBeenCalledWith(ctx, COMPANY_ID);
    expect(replaceProductEmbeddingsInMutation.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCompanyCatalogLanguageHintsInMutation.mock.invocationCallOrder[0],
    );
  });

  it('rejects stale variant create writes', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR', version: 2 });

    await expect(
      insertVariantWithEmbeddingsDefinition.handler(ctx, {
        ...MUTATION_BASE_ARGS,
        label: 'Large',
      }),
    ).rejects.toThrow('CONFLICT: Product was modified concurrently; retry the update');

    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(replaceProductEmbeddingsInMutation).not.toHaveBeenCalled();
  });

  it('rejects stale variant patch writes', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR', version: 2 });

    await expect(
      patchVariantWithEmbeddingsDefinition.handler(ctx, {
        ...MUTATION_BASE_ARGS,
        variantId: VARIANT_ID,
        label: 'XL',
      }),
    ).rejects.toThrow('CONFLICT: Product was modified concurrently; retry the update');

    expect(getScopedVariant).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(replaceProductEmbeddingsInMutation).not.toHaveBeenCalled();
  });
});

