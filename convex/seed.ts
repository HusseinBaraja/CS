import type { Doc, Id, TableNames } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { seedCategories, seedCompany, seedCurrencyRate, seedOffers, seedProducts, seedVariants } from './seedData';

const deleteDocuments = async (
  ctx: MutationCtx,
  ids: Array<Id<TableNames>>,
): Promise<void> => {
  for (const id of ids) {
    await ctx.db.delete(id);
  }
};

const collectCompaniesToClear = async (
  ctx: MutationCtx,
): Promise<Array<Doc<"companies">>> =>
  ctx.db
    .query("companies")
    .withIndex("by_seed_key", (q) => q.eq("seedKey", seedCompany.seedKey))
    .collect();

const clearSeededCompanyData = async (
  ctx: MutationCtx,
  companyId: Id<"companies">,
): Promise<void> => {
  const [categories, products, offers, currencyRates, embeddings, analyticsEvents, conversations] =
    await Promise.all([
      ctx.db.query("categories").withIndex("by_company", (q) => q.eq("companyId", companyId)).collect(),
      ctx.db.query("products").withIndex("by_company", (q) => q.eq("companyId", companyId)).collect(),
      ctx.db.query("offers").withIndex("by_company_active", (q) => q.eq("companyId", companyId)).collect(),
      ctx.db.query("currencyRates").withIndex("by_company", (q) => q.eq("companyId", companyId)).collect(),
      ctx.db.query("embeddings").withIndex("by_company", (q) => q.eq("companyId", companyId)).collect(),
      ctx.db.query("analyticsEvents").withIndex("by_company_type", (q) => q.eq("companyId", companyId)).collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_company_phone_and_muted", (q) => q.eq("companyId", companyId))
        .collect(),
    ]);

  const variants = (
    await Promise.all(
      products.map((product) =>
        ctx.db
          .query("productVariants")
          .withIndex("by_product", (q) => q.eq("productId", product._id))
          .collect(),
      ),
    )
  ).flat();

  const messages = (
    await Promise.all(
      conversations.map((conversation) =>
        ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
          .collect(),
      ),
    )
  ).flat();

  await deleteDocuments(ctx, embeddings.map((doc) => doc._id));
  await deleteDocuments(ctx, variants.map((doc) => doc._id));
  await deleteDocuments(ctx, messages.map((doc) => doc._id));
  await deleteDocuments(ctx, conversations.map((doc) => doc._id));
  await deleteDocuments(ctx, analyticsEvents.map((doc) => doc._id));
  await deleteDocuments(ctx, products.map((doc) => doc._id));
  await deleteDocuments(ctx, categories.map((doc) => doc._id));
  await deleteDocuments(ctx, offers.map((doc) => doc._id));
  await deleteDocuments(ctx, currencyRates.map((doc) => doc._id));
  await ctx.db.delete(companyId);
};

export const seedSampleData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const companiesToClear = await collectCompaniesToClear(ctx);

    for (const company of companiesToClear) {
      await clearSeededCompanyData(ctx, company._id);
    }

    const companyId = await ctx.db.insert("companies", {
      name: seedCompany.name,
      ownerPhone: seedCompany.ownerPhone,
      seedKey: seedCompany.seedKey,
      timezone: seedCompany.timezone,
      config: seedCompany.config,
    });

    const categoryIds = new Map<string, Id<"categories">>();
    for (const category of seedCategories) {
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        descriptionEn: category.descriptionEn,
        descriptionAr: category.descriptionAr,
      });
      categoryIds.set(category.key, categoryId);
    }

    const productIds = new Map<string, Id<"products">>();
    for (const product of seedProducts) {
      const categoryId = categoryIds.get(product.categoryKey);
      if (!categoryId) {
        throw new Error(`Missing category for product ${product.key}`);
      }

      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: product.nameEn,
        nameAr: product.nameAr,
        descriptionEn: product.descriptionEn,
        descriptionAr: product.descriptionAr,
        specifications: product.specifications,
        basePrice: product.basePrice,
        baseCurrency: product.baseCurrency,
        imageUrls: product.imageUrls,
      });
      productIds.set(product.key, productId);
    }

    for (const variant of seedVariants) {
      const productId = productIds.get(variant.productKey);
      if (!productId) {
        throw new Error(`Missing product for variant ${variant.variantLabel}`);
      }

      await ctx.db.insert("productVariants", {
        productId,
        variantLabel: variant.variantLabel,
        attributes: variant.attributes,
        priceOverride: variant.priceOverride,
      });
    }

    const now = Date.now();
    for (const offer of seedOffers) {
      await ctx.db.insert("offers", {
        companyId,
        contentEn: offer.contentEn,
        contentAr: offer.contentAr,
        active: true,
        startDate: now,
        endDate: now + offer.durationDays * 24 * 60 * 60 * 1000,
      });
    }

    await ctx.db.insert("currencyRates", {
      companyId,
      fromCurrency: seedCurrencyRate.fromCurrency,
      toCurrency: seedCurrencyRate.toCurrency,
      rate: seedCurrencyRate.rate,
    });

    return {
      companyId,
      companyName: seedCompany.name,
      clearedCompanies: companiesToClear.length,
      counts: {
        categories: seedCategories.length,
        products: seedProducts.length,
        productVariants: seedVariants.length,
        offers: seedOffers.length,
        currencyRates: 1,
      },
    };
  },
});
