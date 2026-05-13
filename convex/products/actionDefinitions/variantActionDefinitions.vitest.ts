import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '../../_generated/dataModel';
import type { ActionCtx } from '../../_generated/server';

const { buildProductEmbeddingPayload } = vi.hoisted(() => ({
  buildProductEmbeddingPayload: vi.fn(),
}));

vi.mock('../../productEmbeddingRuntime', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../productEmbeddingRuntime')>(),
  buildProductEmbeddingPayload,
}));

import {
  createVariantDefinition,
  removeVariantDefinition,
  updateVariantDefinition,
} from './variantActionDefinitions';

const COMPANY_ID = 'company_1' as Id<'companies'>;
const PRODUCT_ID = 'product_1' as Id<'products'>;
const VARIANT_ID = 'variant_1' as Id<'productVariants'>;

const buildCtx = (): ActionCtx =>
  ({
    runQuery: vi.fn(),
    runMutation: vi.fn(),
  }) as unknown as ActionCtx;

describe('variant action definitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects negative prices before creating a variant', async () => {
    const ctx = buildCtx();

    await expect(
      createVariantDefinition.handler(ctx, {
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        labelEn: 'Large',
        price: -1,
      }),
    ).rejects.toThrow('VALIDATION_FAILED: price must be a non-negative number');

    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it('rejects negative prices before updating a variant', async () => {
    const ctx = buildCtx();

    await expect(
      updateVariantDefinition.handler(ctx, {
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        price: -1,
      }),
    ).rejects.toThrow('VALIDATION_FAILED: price must be a non-negative number');

    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it('clears embeddings when deleting the last searchable variant text', async () => {
    const ctx = buildCtx();
    (ctx.runQuery as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      companyId: COMPANY_ID,
      productId: PRODUCT_ID,
      revision: 3,
      targetVariant: {
        id: VARIANT_ID,
        productId: PRODUCT_ID,
        labelEn: 'Large',
      },
      variants: [
        {
          id: VARIANT_ID,
          productId: PRODUCT_ID,
          labelEn: 'Large',
        },
      ],
    });

    await removeVariantDefinition.handler(ctx, {
      companyId: COMPANY_ID,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
    });

    expect(buildProductEmbeddingPayload).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
      companyId: COMPANY_ID,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      expectedRevision: 3,
      clearEmbeddings: true,
    });
  });

  it('refreshes embeddings when searchable product text remains after deleting a variant', async () => {
    const ctx = buildCtx();
    const snapshot = {
      companyId: COMPANY_ID,
      productId: PRODUCT_ID,
      revision: 3,
      nameEn: 'Paper cups',
      targetVariant: {
        id: VARIANT_ID,
        productId: PRODUCT_ID,
        labelEn: 'Large',
      },
      variants: [
        {
          id: VARIANT_ID,
          productId: PRODUCT_ID,
          labelEn: 'Large',
        },
      ],
    };
    buildProductEmbeddingPayload.mockResolvedValue({
      englishEmbedding: [1],
      arabicEmbedding: [2],
      englishText: 'name:Paper cups',
      arabicText: 'name:Paper cups',
    });
    (ctx.runQuery as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);

    await removeVariantDefinition.handler(ctx, {
      companyId: COMPANY_ID,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
    });

    expect(buildProductEmbeddingPayload).toHaveBeenCalledWith(snapshot, []);
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
      companyId: COMPANY_ID,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      expectedRevision: 3,
      englishEmbedding: [1],
      arabicEmbedding: [2],
      englishText: 'name:Paper cups',
      arabicText: 'name:Paper cups',
    });
  });
});
