import { describe, expect, it, vi } from 'vitest';
import type { Id } from '../../_generated/dataModel';
import type { ActionCtx } from '../../_generated/server';
import {
  createVariantDefinition,
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
  it('rejects negative prices before creating a variant', async () => {
    const ctx = buildCtx();

    await expect(
      createVariantDefinition.handler(ctx, {
        companyId: COMPANY_ID,
        productId: PRODUCT_ID,
        label: 'Large',
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
});
