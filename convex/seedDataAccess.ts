import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import {
  buildSeedCompany,
  seedCategories,
  seedCompanyTemplate,
  seedCurrencyRate,
  seedOffers,
  seedProducts,
  seedUnits,
} from './seedData';
import type { SeedCompanySkeletonResult, SeedInsertResult, SeedProductEmbeddingSnapshot } from './seedTypes';

const assertSeedCompanyTarget = (
  company: Doc<"companies"> | null,
  companyId: Id<"companies">,
): void => {
  if (!company) {
    throw new Error(`Seed company ${companyId} was not found`);
  }

  if (company.seedKey !== seedCompanyTemplate.seedKey) {
    throw new Error(`Company ${companyId} is not the seeded demo tenant`);
  }
};

export const listSeedCompanyIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const companyIds: Array<Id<"companies">> = [];

    for await (const company of ctx.db
      .query("companies")
      .withIndex("by_seed_key", (q) => q.eq("seedKey", seedCompanyTemplate.seedKey))) {
      companyIds.push(company._id);
    }

    return companyIds;
  },
});

export const listSeedProductsForEmbedding = internalQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<SeedProductEmbeddingSnapshot[]> => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const results = await Promise.all(
      products.map(async (product) => {
        const units = await ctx.db
          .query("productUnits")
          .withIndex("by_product", (q) => q.eq("productId", product._id))
          .collect();

        const sortedUnits = [...units].sort((left, right) =>
          (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          (left.labelEn ?? left.labelAr ?? '').localeCompare(right.labelEn ?? right.labelAr ?? '') ||
          left._id.localeCompare(right._id)
        );

        return {
          productId: product._id,
          companyId: product.companyId,
          categoryId: product.categoryId,
          ...(product.nameEn ? { nameEn: product.nameEn } : {}),
          ...(product.nameAr ? { nameAr: product.nameAr } : {}),
          ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
          ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
          units: sortedUnits.map((unit) => ({
            id: unit._id,
            productId: unit.productId,
            ...(unit.labelEn ? { labelEn: unit.labelEn } : {}),
            ...(unit.labelAr ? { labelAr: unit.labelAr } : {}),
            price: unit.price,
          })),
        };
      }),
    );

    return results.sort((left, right) => {
      const leftName = left.nameEn ?? left.nameAr ?? '';
      const rightName = right.nameEn ?? right.nameAr ?? '';
      return leftName.localeCompare(rightName) || left.productId.localeCompare(right.productId);
    });
  },
});

export const insertSeedSampleData = internalMutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args): Promise<Omit<SeedInsertResult, "companyName" | "companyId">["counts"]> => {
    assertSeedCompanyTarget(await ctx.db.get(args.companyId), args.companyId);

    const categoryIds = new Map<string, Id<"categories">>();
    for (const category of seedCategories) {
      if (categoryIds.has(category.key)) {
        throw new Error(`Duplicate category seed key: ${category.key}`);
      }

      const categoryId = await ctx.db.insert("categories", {
        companyId: args.companyId,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        descriptionEn: category.descriptionEn,
        descriptionAr: category.descriptionAr,
      });
      categoryIds.set(category.key, categoryId);
    }

    const productIds = new Map<string, Id<"products">>();
    for (const product of seedProducts) {
      if (productIds.has(product.key)) {
        throw new Error(`Duplicate product seed key: ${product.key}`);
      }

      const categoryId = categoryIds.get(product.categoryKey);
      if (!categoryId) {
        throw new Error(`Missing category for product ${product.key}`);
      }

      const productId = await ctx.db.insert("products", {
        companyId: args.companyId,
        categoryId,
        nameEn: product.nameEn,
        nameAr: product.nameAr,
        descriptionEn: product.descriptionEn,
        descriptionAr: product.descriptionAr,
      });
      productIds.set(product.key, productId);
    }

    for (const [index, unit] of seedUnits.entries()) {
      const productId = productIds.get(unit.productKey);
      if (!productId) {
        throw new Error(`Missing product for unit ${unit.labelEn}`);
      }

      await ctx.db.insert("productUnits", {
        companyId: args.companyId,
        productId,
        ...(unit.labelEn !== undefined ? { labelEn: unit.labelEn } : {}),
        ...(unit.labelAr !== undefined ? { labelAr: unit.labelAr } : {}),
        price: unit.price,
        sortOrder: index,
      });
    }

    await ctx.db.insert("companySettings", {
      companyId: args.companyId,
      missingPricePolicy: "reply_unavailable",
      operatingCurrency: seedCurrencyRate.fromCurrency,
    });

    const now = Date.now();
    for (const offer of seedOffers) {
      await ctx.db.insert("offers", {
        companyId: args.companyId,
        contentEn: offer.contentEn,
        contentAr: offer.contentAr,
        active: true,
        startDate: now,
        endDate: now + offer.durationDays * 24 * 60 * 60 * 1000,
      });
    }

    await ctx.db.insert("currencyRates", {
      companyId: args.companyId,
      fromCurrency: seedCurrencyRate.fromCurrency,
      toCurrency: seedCurrencyRate.toCurrency,
      rate: seedCurrencyRate.rate,
    });

    return {
      categories: seedCategories.length,
      embeddings: 0,
      products: seedProducts.length,
      productUnits: seedUnits.length,
      offers: seedOffers.length,
      currencyRates: 1,
    };
  },
});

export const upsertSeedCompanySkeleton = internalMutation({
  args: {
    ownerPhone: v.string(),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<SeedCompanySkeletonResult> => {
    const seedCompany = buildSeedCompany(args.ownerPhone);
    if (args.companyId) {
      assertSeedCompanyTarget(await ctx.db.get(args.companyId), args.companyId);

      await ctx.db.patch(args.companyId, {
        name: seedCompany.name,
        ownerPhone: seedCompany.ownerPhone,
        seedKey: seedCompany.seedKey,
        timezone: seedCompany.timezone,
        config: seedCompany.config,
        botRuntimePairingLeaseExpiresAt: undefined,
        botRuntimePairingLeaseOwner: undefined,
        botRuntimeSessionLeaseExpiresAt: undefined,
        botRuntimeSessionLeaseOwner: undefined,
      });

      return {
        companyId: args.companyId,
        companyName: seedCompany.name,
      };
    }

    const companyId = await ctx.db.insert("companies", {
      name: seedCompany.name,
      ownerPhone: seedCompany.ownerPhone,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
      config: seedCompany.config,
    });

    return {
      companyId,
      companyName: seedCompany.name,
    };
  },
});
