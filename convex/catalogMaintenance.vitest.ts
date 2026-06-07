/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === 'function'
    ? import.meta.glob(['./**/*.ts', '!./**/*.vitest.ts', '!./vitest.config.ts'])
    : ({} as Record<string, () => Promise<unknown>>);

describe.skipIf(typeof import.meta.glob !== 'function')('catalog maintenance', () => {
  it('clears only catalog data for a company', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) => {
      const insertedCompanyId = await ctx.db.insert('companies', {
        name: 'YAS Trading',
        ownerPhone: '967700000001',
      });
      await ctx.db.insert('companySettings', {
        companyId: insertedCompanyId,
        missingPricePolicy: 'handoff',
        operatingCurrency: 'YER',
      });
      const categoryId = await ctx.db.insert('categories', {
        companyId: insertedCompanyId,
        nameEn: 'Cups',
      });
      const productId = await ctx.db.insert('products', {
        companyId: insertedCompanyId,
        categoryId,
        nameEn: 'Paper Cup',
      });
      await ctx.db.insert('productUnits', {
        companyId: insertedCompanyId,
        productId,
        labelEn: 'Carton',
        price: 100,
      });
      await ctx.db.insert('productVariants', {
        companyId: insertedCompanyId,
        productId,
        labelEn: 'White',
      });
      await ctx.db.insert('embeddings', {
        companyId: insertedCompanyId,
        productId,
        embedding: Array.from({ length: 768 }, () => 0.1),
        textContent: 'Paper Cup',
        companyLanguage: `${insertedCompanyId}:en`,
      });
      await ctx.db.insert('productImageUploads', {
        companyId: insertedCompanyId,
        productId,
        imageId: 'image-1',
        objectKey: 'image-key',
        intendedContentType: 'image/jpeg',
        maxSizeBytes: 100,
        status: 'pending',
        expiresAt: 1,
        createdAt: 0,
      });
      await ctx.db.insert('mediaCleanupJobs', {
        companyId: insertedCompanyId,
        productId,
        objectKey: 'image-key',
        reason: 'test',
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        leaseExpiresAt: 0,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert('offers', {
        companyId: insertedCompanyId,
        contentEn: 'Offer',
        active: true,
      });
      await ctx.db.insert('currencyRates', {
        companyId: insertedCompanyId,
        fromCurrency: 'SAR',
        toCurrency: 'YER',
        rate: 450,
      });
      await ctx.db.insert('conversations', {
        companyId: insertedCompanyId,
        phoneNumber: '967700000002',
        muted: false,
      });

      return insertedCompanyId;
    });

    const result = await t.action(internal.catalogMaintenance.clearCompanyCatalog, { companyId });
    const remaining = await t.run(async (ctx) => ({
      categories: await ctx.db.query('categories').collect(),
      companySettings: await ctx.db.query('companySettings').collect(),
      conversations: await ctx.db.query('conversations').collect(),
      currencyRates: await ctx.db.query('currencyRates').collect(),
      embeddings: await ctx.db.query('embeddings').collect(),
      mediaCleanupJobs: await ctx.db.query('mediaCleanupJobs').collect(),
      offers: await ctx.db.query('offers').collect(),
      productImageUploads: await ctx.db.query('productImageUploads').collect(),
      products: await ctx.db.query('products').collect(),
      productUnits: await ctx.db.query('productUnits').collect(),
      productVariants: await ctx.db.query('productVariants').collect(),
    }));

    expect(result?.counts).toMatchObject({
      categories: 1,
      currencyRates: 1,
      embeddings: 1,
      mediaCleanupJobs: 1,
      offers: 1,
      productImageUploads: 1,
      products: 1,
      productUnits: 1,
      productVariants: 1,
    });
    expect(remaining.companySettings).toHaveLength(1);
    expect(remaining.conversations).toHaveLength(1);
    expect(remaining.categories).toHaveLength(0);
    expect(remaining.products).toHaveLength(0);
    expect(remaining.productUnits).toHaveLength(0);
    expect(remaining.productVariants).toHaveLength(0);
    expect(remaining.embeddings).toHaveLength(0);
    expect(remaining.productImageUploads).toHaveLength(0);
    expect(remaining.mediaCleanupJobs).toHaveLength(0);
    expect(remaining.offers).toHaveLength(0);
    expect(remaining.currencyRates).toHaveLength(0);
  });
});
