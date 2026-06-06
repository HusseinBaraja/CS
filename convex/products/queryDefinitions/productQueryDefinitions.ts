import { v } from 'convex/values';
import type { Id } from '../../_generated/dataModel';
import type { QueryCtx } from '../../_generated/server';
import {
  buildSearchText,
  mapProduct,
  mapProductDetail,
  mapVariant,
  sortProducts,
} from '../mapping';
import { normalizeOptionalString } from '../normalization';
import { getCompany, getProductVariants, getScopedProduct } from '../readers';
import type {
  ProductDetailDto,
  ProductListItemDto,
  ProductVariantDto,
} from '../types';

export const listDefinition = {
  args: {
    companyId: v.id('companies'),
    categoryId: v.optional(v.id('categories')),
    search: v.optional(v.string()),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      companyId: Id<'companies'>;
      categoryId?: Id<'categories'>;
      search?: string;
    },
  ): Promise<ProductListItemDto[] | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const categoryId = args.categoryId;
    const products = categoryId
      ? await ctx.db
          .query('products')
          .withIndex('by_category', (q) =>
            q.eq('companyId', args.companyId).eq('categoryId', categoryId),
          )
          .collect()
      : await ctx.db
          .query('products')
          .withIndex('by_company', (q) => q.eq('companyId', args.companyId))
          .collect();

    const search = normalizeOptionalString(args.search)?.toLocaleLowerCase();
    const filteredProducts = products
      .map(mapProduct)
      .filter((product) => !search || buildSearchText(product).includes(search));

    return sortProducts(filteredProducts);
  },
};

export const getDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
  },
  handler: async (
    ctx: QueryCtx,
    args: { companyId: Id<'companies'>; productId: Id<'products'> },
  ): Promise<ProductDetailDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const variants = await getProductVariants(ctx, args.companyId, args.productId);
    return mapProductDetail(product, variants);
  },
};

export const getManyForRagDefinition = {
  args: {
    companyId: v.id('companies'),
    productIds: v.array(v.id('products')),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      companyId: Id<'companies'>;
      productIds: Id<'products'>[];
    },
  ): Promise<ProductDetailDto[]> => {
    const seenProductIds = new Set<string>();
    const uniqueProductIds = args.productIds.filter((productId) => {
      if (seenProductIds.has(productId)) {
        return false;
      }

      seenProductIds.add(productId);
      return true;
    });

    const results = await Promise.all(
      uniqueProductIds.map(async (productId): Promise<ProductDetailDto | null> => {
        const [product, variants] = await Promise.all([
          getScopedProduct(ctx, args.companyId, productId),
          getProductVariants(ctx, args.companyId, productId),
        ]);
        if (!product) {
          return null;
        }

        return mapProductDetail(product, variants);
      }),
    );

    return results.filter((result): result is ProductDetailDto => result !== null);
  },
};

export const listVariantsDefinition = {
  args: {
    companyId: v.id('companies'),
    productId: v.id('products'),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      companyId: Id<'companies'>;
      productId: Id<'products'>;
    },
  ): Promise<ProductVariantDto[] | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const variants = await getProductVariants(ctx, args.companyId, args.productId);
    return variants.map(mapVariant);
  },
};
