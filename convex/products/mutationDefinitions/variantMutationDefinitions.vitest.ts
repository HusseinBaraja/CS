/// <reference types='vite/client' />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';

const {
  replaceProductEmbeddingsInMutation,
  refreshCompanyCatalogLanguageHintsInMutation,
  getScopedProduct,
  getScopedVariant,
  normalizeVariantCreateState,
  createVariantPatch,
  mapVariant,
} = vi.hoisted(() => ({
  replaceProductEmbeddingsInMutation: vi.fn(),
  refreshCompanyCatalogLanguageHintsInMutation: vi.fn(),
  getScopedProduct: vi.fn(),
  getScopedVariant: vi.fn(),
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

describe('variant mutation definitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes catalog language hints after creating a variant embedding', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR' });
    normalizeVariantCreateState.mockReturnValue({
      productId: PRODUCT_ID,
      label: 'Large',
      price: 10,
      currency: "SAR", // Mocked for assertProductHasCurrency
    });
    (ctx.db.insert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(VARIANT_ID);
    (ctx.db.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: VARIANT_ID,
      productId: PRODUCT_ID,
      label: 'Large',
      price: 10,
      currency: "SAR", // Mocked for assertProductHasCurrency
    });
    mapVariant.mockReturnValue({ id: VARIANT_ID });

    await insertVariantWithEmbeddingsDefinition.handler(ctx, {
      ...EMBEDDING_ARGS,
      label: 'Large',
    });

    expect(replaceProductEmbeddingsInMutation).toHaveBeenCalledWith(ctx, EMBEDDING_ARGS);
    expect(refreshCompanyCatalogLanguageHintsInMutation).toHaveBeenCalledWith(ctx, COMPANY_ID);
    expect(replaceProductEmbeddingsInMutation.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCompanyCatalogLanguageHintsInMutation.mock.invocationCallOrder[0],
    );
  });

  it('refreshes catalog language hints after patching a variant embedding', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR' });
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
      ...EMBEDDING_ARGS,
      variantId: VARIANT_ID,
      label: 'XL',
    });

    expect(replaceProductEmbeddingsInMutation).toHaveBeenCalledWith(ctx, EMBEDDING_ARGS);
    expect(refreshCompanyCatalogLanguageHintsInMutation).toHaveBeenCalledWith(ctx, COMPANY_ID);
    expect(replaceProductEmbeddingsInMutation.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCompanyCatalogLanguageHintsInMutation.mock.invocationCallOrder[0],
    );
  });

  it('refreshes catalog language hints after deleting a variant embedding', async () => {
    const ctx = buildCtx();
    getScopedProduct.mockResolvedValue({ currency: 'SAR' });
    getScopedVariant.mockResolvedValue({ _id: VARIANT_ID });

    await removeVariantWithEmbeddingsDefinition.handler(ctx, {
      ...EMBEDDING_ARGS,
      variantId: VARIANT_ID,
    });

    expect(replaceProductEmbeddingsInMutation).toHaveBeenCalledWith(ctx, EMBEDDING_ARGS);
    expect(refreshCompanyCatalogLanguageHintsInMutation).toHaveBeenCalledWith(ctx, COMPANY_ID);
    expect(replaceProductEmbeddingsInMutation.mock.invocationCallOrder[0]).toBeLessThan(
      refreshCompanyCatalogLanguageHintsInMutation.mock.invocationCallOrder[0],
    );
  });
});

