/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { setGeminiClientFactoryForTests } from '@cs/ai';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === 'function'
    ? import.meta.glob(['./**/*.ts', '!./**/*.vitest.ts', '!./vitest.config.ts'])
    : ({} as Record<string, () => Promise<unknown>>);

let resetGeminiClientFactory: (() => void) | null = null;

afterEach(() => {
  resetGeminiClientFactory?.();
  resetGeminiClientFactory = null;
});

const installGeminiStub = () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  resetGeminiClientFactory = setGeminiClientFactoryForTests(() => ({
    models: {
      embedContent: async ({ contents }) => ({
        embeddings: (contents ?? []).map((_content, index) => ({
          values: Array.from({ length: 768 }, (_, valueIndex) => index + valueIndex / 1000),
        })),
      }),
    },
  }));
};

describe.skipIf(typeof import.meta.glob !== 'function')('convex catalog imports', () => {
  it('creates and then replaces a product group by product number', async () => {
    installGeminiStub();
    const t = convexTest(schema, modules);
    const companyId = await t.run((ctx) => ctx.db.insert('companies', {
      name: 'YAS_Trading',
      ownerPhone: '967700000001',
    }));

    await t.action(internal.catalogImports.apply, {
      companyId,
      groups: [{
        productNo: 'P-1',
        category: { en: 'Cups', ar: 'أكواب' },
        productName: { en: 'Paper Cup', ar: 'كوب ورقي' },
        variants: [
          { labelEn: 'Small', labelAr: 'صغير', price: 9 },
          { labelEn: 'Large', labelAr: 'كبير', price: 12 },
        ],
      }],
    });

    const secondResult = await t.action(internal.catalogImports.apply, {
      companyId,
      groups: [{
        productNo: 'P-1',
        category: { en: 'Cups', ar: 'أكواب' },
        productName: { en: 'Paper Cup Updated', ar: 'كوب ورقي محدث' },
        variants: [{ labelEn: 'Medium', labelAr: 'وسط', price: 10 }],
      }],
    });

    const state = await t.run(async (ctx) => {
      const products = await ctx.db.query('products').collect();
      const variants = await ctx.db.query('productVariants').collect();
      const embeddings = await ctx.db.query('embeddings').collect();
      return { products, variants, embeddings };
    });

    expect(secondResult.replacedProductGroupCount).toBe(1);
    expect(secondResult.replacedVariantCount).toBe(1);
    expect(state.products).toHaveLength(1);
    expect(state.products[0]?.nameEn).toBe('Paper Cup Updated');
    expect(state.variants.map((variant) => variant.labelEn)).toEqual(['Medium']);
    expect(state.embeddings).toHaveLength(2);
    expect(state.embeddings.map((embedding) => embedding.textContent).join('\n')).toContain('label:Medium');
    expect(state.embeddings.map((embedding) => embedding.textContent).join('\n')).not.toContain('label:Small');
  });
});
