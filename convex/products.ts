import { GEMINI_EMBEDDING_DIMENSIONS, generateGeminiEmbeddings } from '@cs/ai';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery, mutation, type MutationCtx, query } from './_generated/server';

const flexValue = v.union(v.string(), v.number(), v.boolean());
const flexRecord = v.record(v.string(), flexValue);

type ProductSpecifications = Record<string, string | number | boolean>;

type ProductVariantDto = {
  id: string;
  productId: string;
  variantLabel: string;
  attributes: ProductSpecifications;
  priceOverride?: number;
};

type ProductListItemDto = {
  id: string;
  companyId: string;
  categoryId: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: ProductSpecifications;
  basePrice?: number;
  baseCurrency?: string;
  imageUrls?: string[];
};

type ProductDetailDto = ProductListItemDto & {
  variants: ProductVariantDto[];
};

type DeleteProductResult = {
  productId: string;
};

type ProductWriteState = {
  companyId: Id<"companies">;
  categoryId: Id<"categories">;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: ProductSpecifications;
  basePrice?: number;
  baseCurrency?: string;
  imageUrls?: string[];
};

type ProductUpdateArgs = {
  companyId: Id<"companies">;
  productId: Id<"products">;
  categoryId?: Id<"categories">;
  nameEn?: string;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  specifications?: ProductSpecifications | null;
  basePrice?: number | null;
  baseCurrency?: string | null;
  imageUrls?: string[] | null;
};

type ProductWriteSnapshot = ProductWriteState & {
  productId: Id<"products">;
};

type ProductReader = {
  db: Pick<MutationCtx["db"], "get" | "query">;
};

const AI_PREFIX = "AI_PROVIDER_FAILED";
const NOT_FOUND_PREFIX = "NOT_FOUND";
const VALIDATION_PREFIX = "VALIDATION_FAILED";

const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

const normalizeRequiredString = (value: string, fieldName: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} is required`);
  }

  return normalized;
};

const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeOptionalNumber = (
  value: number | null | undefined,
  fieldName: string,
): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} must be a non-negative number`);
  }

  return value;
};

const normalizeSpecifications = (
  value: ProductSpecifications | null | undefined,
): ProductSpecifications | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalizedEntries = Object.entries(value).map(([key, entryValue]) => {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) {
      throw createTaggedError(VALIDATION_PREFIX, "specifications keys must be non-empty strings");
    }

    return [normalizedKey, entryValue] as const;
  });

  return Object.fromEntries(normalizedEntries);
};

const normalizeImageUrls = (value: string[] | null | undefined): string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value.map((url, index) => {
    const normalized = url.trim();
    if (normalized.length === 0) {
      throw createTaggedError(VALIDATION_PREFIX, `imageUrls[${index}] must be a non-empty string`);
    }

    return normalized;
  });
};

const mapVariant = (variant: Doc<"productVariants">): ProductVariantDto => ({
  id: variant._id,
  productId: variant.productId,
  variantLabel: variant.variantLabel,
  attributes: variant.attributes,
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
});

const mapProduct = (product: Doc<"products">): ProductListItemDto => ({
  id: product._id,
  companyId: product.companyId,
  categoryId: product.categoryId,
  nameEn: product.nameEn,
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.specifications ? { specifications: product.specifications } : {}),
  ...(product.basePrice !== undefined ? { basePrice: product.basePrice } : {}),
  ...(product.baseCurrency ? { baseCurrency: product.baseCurrency } : {}),
  ...(product.imageUrls ? { imageUrls: product.imageUrls } : {}),
});

const mapProductDetail = (
  product: Doc<"products">,
  variants: Doc<"productVariants">[],
): ProductDetailDto => ({
  ...mapProduct(product),
  variants: variants.map(mapVariant),
});

const toWriteState = (product: Doc<"products">): ProductWriteState => ({
  companyId: product.companyId,
  categoryId: product.categoryId,
  nameEn: product.nameEn,
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.specifications ? { specifications: product.specifications } : {}),
  ...(product.basePrice !== undefined ? { basePrice: product.basePrice } : {}),
  ...(product.baseCurrency ? { baseCurrency: product.baseCurrency } : {}),
  ...(product.imageUrls ? { imageUrls: product.imageUrls } : {}),
});

const sortProducts = <T extends ProductListItemDto>(products: T[]): T[] =>
  products.sort((left, right) => left.nameEn.localeCompare(right.nameEn) || left.id.localeCompare(right.id));

const serializeSpecifications = (specifications: ProductSpecifications | undefined): string =>
  specifications
    ? Object.entries(specifications)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join("\n")
    : "";

const buildSearchText = (product: ProductListItemDto): string =>
  [
    product.nameEn,
    product.nameAr,
    product.descriptionEn,
    product.descriptionAr,
    serializeSpecifications(product.specifications),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLocaleLowerCase();

const buildLanguageEmbeddingText = (
  product: ProductWriteState,
  language: "en" | "ar",
): string => {
  const name =
    language === "en"
      ? product.nameEn
      : normalizeOptionalString(product.nameAr) ?? product.nameEn;
  const description =
    language === "en"
      ? normalizeOptionalString(product.descriptionEn)
      : normalizeOptionalString(product.descriptionAr) ?? normalizeOptionalString(product.descriptionEn);
  const specs = serializeSpecifications(product.specifications);

  return [
    `language:${language}`,
    `name:${name}`,
    description ? `description:${description}` : undefined,
    specs ? `specifications:\n${specs}` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
};

const getCompanyLanguageKey = (
  companyId: Id<"companies">,
  language: "en" | "ar",
): string => `${companyId}:${language}`;

const buildProductEmbeddings = async (
  product: ProductWriteState,
): Promise<{
  englishEmbedding: number[];
  arabicEmbedding: number[];
  englishText: string;
  arabicText: string;
}> => {
  const englishText = buildLanguageEmbeddingText(product, "en");
  const arabicText = buildLanguageEmbeddingText(product, "ar");

  try {
    const [englishEmbedding, arabicEmbedding] = await generateGeminiEmbeddings([
      englishText,
      arabicText,
    ], {
      model: "gemini-embedding-001",
      outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
    });

    return {
      englishEmbedding,
      arabicEmbedding,
      englishText,
      arabicText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini embeddings failed";
    throw createTaggedError(AI_PREFIX, message);
  }
};

const hasEmbeddingRelevantChanges = (
  previous: ProductWriteState,
  next: ProductWriteState,
): boolean =>
  previous.nameEn !== next.nameEn ||
  previous.nameAr !== next.nameAr ||
  previous.descriptionEn !== next.descriptionEn ||
  previous.descriptionAr !== next.descriptionAr ||
  serializeSpecifications(previous.specifications) !== serializeSpecifications(next.specifications);

const getCompany = async (
  ctx: ProductReader,
  companyId: Id<"companies">,
) => ctx.db.get(companyId);

const getScopedCategory = async (
  ctx: ProductReader,
  companyId: Id<"companies">,
  categoryId: Id<"categories">,
): Promise<Doc<"categories"> | null> => {
  const category = await ctx.db.get(categoryId);
  if (!category || category.companyId !== companyId) {
    return null;
  }

  return category;
};

const getScopedProduct = async (
  ctx: ProductReader,
  companyId: Id<"companies">,
  productId: Id<"products">,
): Promise<Doc<"products"> | null> => {
  const product = await ctx.db.get(productId);
  if (!product || product.companyId !== companyId) {
    return null;
  }

  return product;
};

const getProductVariants = async (
  ctx: ProductReader,
  productId: Id<"products">,
): Promise<Doc<"productVariants">[]> =>
  ctx.db
    .query("productVariants")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();

const insertEmbeddings = async (
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    productId: Id<"products">;
    englishEmbedding: number[];
    arabicEmbedding: number[];
    englishText: string;
    arabicText: string;
  },
): Promise<void> => {
  await ctx.db.insert("embeddings", {
    companyId: args.companyId,
    productId: args.productId,
    embedding: args.englishEmbedding,
    textContent: args.englishText,
    language: "en",
    companyLanguage: getCompanyLanguageKey(args.companyId, "en"),
  });

  await ctx.db.insert("embeddings", {
    companyId: args.companyId,
    productId: args.productId,
    embedding: args.arabicEmbedding,
    textContent: args.arabicText,
    language: "ar",
    companyLanguage: getCompanyLanguageKey(args.companyId, "ar"),
  });
};

const replaceEmbeddings = async (
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    productId: Id<"products">;
    englishEmbedding: number[];
    arabicEmbedding: number[];
    englishText: string;
    arabicText: string;
  },
): Promise<void> => {
  const existingEmbeddings = await ctx.db
    .query("embeddings")
    .withIndex("by_product", (q) => q.eq("productId", args.productId))
    .collect();

  for (const embedding of existingEmbeddings) {
    await ctx.db.delete(embedding._id);
  }

  await insertEmbeddings(ctx, args);
};

const getEmbeddingReplacementArgs = (args: {
  companyId: Id<"companies">;
  productId: Id<"products">;
  englishEmbedding?: number[];
  arabicEmbedding?: number[];
  englishText?: string;
  arabicText?: string;
}):
  | {
    companyId: Id<"companies">;
    productId: Id<"products">;
    englishEmbedding: number[];
    arabicEmbedding: number[];
    englishText: string;
    arabicText: string;
  }
  | null => {
  const embeddingValues = [
    args.englishEmbedding,
    args.arabicEmbedding,
    args.englishText,
    args.arabicText,
  ];
  const hasAnyEmbeddingValue = embeddingValues.some((value) => value !== undefined);
  const hasAllEmbeddingValues = embeddingValues.every((value) => value !== undefined);

  if (hasAnyEmbeddingValue && !hasAllEmbeddingValues) {
    throw createTaggedError(VALIDATION_PREFIX, "Embedding replacement payload must be all-or-none");
  }

  if (!hasAllEmbeddingValues) {
    return null;
  }

  return {
    companyId: args.companyId,
    productId: args.productId,
    englishEmbedding: args.englishEmbedding!,
    arabicEmbedding: args.arabicEmbedding!,
    englishText: args.englishText!,
    arabicText: args.arabicText!,
  };
};

const normalizeCreateState = (args: {
  companyId: Id<"companies">;
  categoryId: Id<"categories">;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  specifications?: ProductSpecifications;
  basePrice?: number;
  baseCurrency?: string;
  imageUrls?: string[];
}): ProductWriteState => ({
  companyId: args.companyId,
  categoryId: args.categoryId,
  nameEn: normalizeRequiredString(args.nameEn, "nameEn"),
  ...(normalizeOptionalString(args.nameAr) ? { nameAr: normalizeOptionalString(args.nameAr) } : {}),
  ...(normalizeOptionalString(args.descriptionEn)
    ? { descriptionEn: normalizeOptionalString(args.descriptionEn) }
    : {}),
  ...(normalizeOptionalString(args.descriptionAr)
    ? { descriptionAr: normalizeOptionalString(args.descriptionAr) }
    : {}),
  ...(normalizeSpecifications(args.specifications) ? { specifications: normalizeSpecifications(args.specifications) } : {}),
  ...(normalizeOptionalNumber(args.basePrice, "basePrice") !== undefined
    ? { basePrice: normalizeOptionalNumber(args.basePrice, "basePrice") }
    : {}),
  ...(normalizeOptionalString(args.baseCurrency)
    ? { baseCurrency: normalizeOptionalString(args.baseCurrency) }
    : {}),
  ...(normalizeImageUrls(args.imageUrls) ? { imageUrls: normalizeImageUrls(args.imageUrls) } : {}),
});

const mergeUpdateState = (
  existingProduct: ProductWriteSnapshot,
  patch: ProductUpdateArgs,
): ProductWriteState => ({
  companyId: existingProduct.companyId,
  categoryId: patch.categoryId ?? existingProduct.categoryId,
  nameEn:
    patch.nameEn !== undefined
      ? normalizeRequiredString(patch.nameEn, "nameEn")
      : existingProduct.nameEn,
  ...(patch.nameAr !== undefined
    ? (normalizeOptionalString(patch.nameAr) ? { nameAr: normalizeOptionalString(patch.nameAr) } : {})
    : (existingProduct.nameAr ? { nameAr: existingProduct.nameAr } : {})),
  ...(patch.descriptionEn !== undefined
    ? (normalizeOptionalString(patch.descriptionEn)
      ? { descriptionEn: normalizeOptionalString(patch.descriptionEn) }
      : {})
    : (existingProduct.descriptionEn ? { descriptionEn: existingProduct.descriptionEn } : {})),
  ...(patch.descriptionAr !== undefined
    ? (normalizeOptionalString(patch.descriptionAr)
      ? { descriptionAr: normalizeOptionalString(patch.descriptionAr) }
      : {})
    : (existingProduct.descriptionAr ? { descriptionAr: existingProduct.descriptionAr } : {})),
  ...(patch.specifications !== undefined
    ? (normalizeSpecifications(patch.specifications)
      ? { specifications: normalizeSpecifications(patch.specifications) }
      : {})
    : (existingProduct.specifications ? { specifications: existingProduct.specifications } : {})),
  ...(patch.basePrice !== undefined
    ? (normalizeOptionalNumber(patch.basePrice, "basePrice") !== undefined
      ? { basePrice: normalizeOptionalNumber(patch.basePrice, "basePrice") }
      : {})
    : (existingProduct.basePrice !== undefined ? { basePrice: existingProduct.basePrice } : {})),
  ...(patch.baseCurrency !== undefined
    ? (normalizeOptionalString(patch.baseCurrency)
      ? { baseCurrency: normalizeOptionalString(patch.baseCurrency) }
      : {})
    : (existingProduct.baseCurrency ? { baseCurrency: existingProduct.baseCurrency } : {})),
  ...(patch.imageUrls !== undefined
    ? (normalizeImageUrls(patch.imageUrls) ? { imageUrls: normalizeImageUrls(patch.imageUrls) } : {})
    : (existingProduct.imageUrls ? { imageUrls: existingProduct.imageUrls } : {})),
});

const createProductPatch = (
  args: ProductUpdateArgs,
): {
  categoryId?: Id<"categories">;
  nameEn?: string;
  nameAr?: string | undefined;
  descriptionEn?: string | undefined;
  descriptionAr?: string | undefined;
  specifications?: ProductSpecifications | undefined;
  basePrice?: number | undefined;
  baseCurrency?: string | undefined;
  imageUrls?: string[] | undefined;
} => {
  const patch: {
    categoryId?: Id<"categories">;
    nameEn?: string;
    nameAr?: string | undefined;
    descriptionEn?: string | undefined;
    descriptionAr?: string | undefined;
    specifications?: ProductSpecifications | undefined;
    basePrice?: number | undefined;
    baseCurrency?: string | undefined;
    imageUrls?: string[] | undefined;
  } = {};

  if (args.categoryId !== undefined) {
    patch.categoryId = args.categoryId;
  }

  if (args.nameEn !== undefined) {
    patch.nameEn = normalizeRequiredString(args.nameEn, "nameEn");
  }

  if (args.nameAr !== undefined) {
    patch.nameAr = normalizeOptionalString(args.nameAr);
  }

  if (args.descriptionEn !== undefined) {
    patch.descriptionEn = normalizeOptionalString(args.descriptionEn);
  }

  if (args.descriptionAr !== undefined) {
    patch.descriptionAr = normalizeOptionalString(args.descriptionAr);
  }

  if (args.specifications !== undefined) {
    patch.specifications = normalizeSpecifications(args.specifications);
  }

  if (args.basePrice !== undefined) {
    patch.basePrice = normalizeOptionalNumber(args.basePrice, "basePrice");
  }

  if (args.baseCurrency !== undefined) {
    patch.baseCurrency = normalizeOptionalString(args.baseCurrency);
  }

  if (args.imageUrls !== undefined) {
    patch.imageUrls = normalizeImageUrls(args.imageUrls);
  }

  return patch;
};

export const list = query({
  args: {
    companyId: v.id("companies"),
    categoryId: v.optional(v.id("categories")),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProductListItemDto[] | null> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      return null;
    }

    const categoryId = args.categoryId;
    const products = categoryId
      ? await ctx.db
        .query("products")
        .withIndex("by_category", (q) =>
          q.eq("companyId", args.companyId).eq("categoryId", categoryId),
        )
        .collect()
      : await ctx.db
        .query("products")
        .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
        .collect();

    const search = normalizeOptionalString(args.search)?.toLocaleLowerCase();
    const filteredProducts = products
      .map(mapProduct)
      .filter((product) => !search || buildSearchText(product).includes(search));

    return sortProducts(filteredProducts);
  },
});

export const get = query({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
  },
  handler: async (ctx, args): Promise<ProductDetailDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const variants = await getProductVariants(ctx, args.productId);
    return mapProductDetail(product, variants);
  },
});

export const getCreateContext = internalQuery({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args) => {
    const company = await getCompany(ctx, args.companyId);
    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);

    return {
      companyExists: Boolean(company),
      categoryExists: Boolean(category),
    };
  },
});

export const getUpdateSnapshot = internalQuery({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
  },
  handler: async (ctx, args): Promise<ProductWriteSnapshot | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    return {
      productId: product._id,
      ...toWriteState(product),
    };
  },
});

export const categoryExistsForCompany = internalQuery({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
    return Boolean(category);
  },
});

export const insertProductWithEmbeddings = internalMutation({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    specifications: v.optional(flexRecord),
    basePrice: v.optional(v.number()),
    baseCurrency: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (ctx, args): Promise<ProductDetailDto> => {
    const company = await getCompany(ctx, args.companyId);
    if (!company) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Company not found");
    }

    const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
    if (!category) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Category not found");
    }

    const productState = normalizeCreateState(args);
    const productId = await ctx.db.insert("products", {
      companyId: args.companyId,
      categoryId: productState.categoryId,
      nameEn: productState.nameEn,
      ...(productState.nameAr ? { nameAr: productState.nameAr } : {}),
      ...(productState.descriptionEn ? { descriptionEn: productState.descriptionEn } : {}),
      ...(productState.descriptionAr ? { descriptionAr: productState.descriptionAr } : {}),
      ...(productState.specifications ? { specifications: productState.specifications } : {}),
      ...(productState.basePrice !== undefined ? { basePrice: productState.basePrice } : {}),
      ...(productState.baseCurrency ? { baseCurrency: productState.baseCurrency } : {}),
      ...(productState.imageUrls ? { imageUrls: productState.imageUrls } : {}),
    });

    await insertEmbeddings(ctx, {
      companyId: args.companyId,
      productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });

    const product = await ctx.db.get(productId);
    if (!product) {
      throw new Error("Created product could not be loaded");
    }

    return mapProductDetail(product, []);
  },
});

export const patchProductWithEmbeddings = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    categoryId: v.optional(v.id("categories")),
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.union(v.string(), v.null())),
    descriptionEn: v.optional(v.union(v.string(), v.null())),
    descriptionAr: v.optional(v.union(v.string(), v.null())),
    specifications: v.optional(v.union(flexRecord, v.null())),
    basePrice: v.optional(v.union(v.number(), v.null())),
    baseCurrency: v.optional(v.union(v.string(), v.null())),
    imageUrls: v.optional(v.union(v.array(v.string()), v.null())),
    englishEmbedding: v.optional(v.array(v.float64())),
    arabicEmbedding: v.optional(v.array(v.float64())),
    englishText: v.optional(v.string()),
    arabicText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProductDetailDto | null> => {
    const existingProduct = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!existingProduct) {
      return null;
    }

    if (args.categoryId !== undefined) {
      const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
      if (!category) {
        throw createTaggedError(NOT_FOUND_PREFIX, "Category not found");
      }
    }

    const patch = createProductPatch(args);
    await ctx.db.patch(args.productId, patch);

    const embeddingReplacementArgs = getEmbeddingReplacementArgs(args);
    if (embeddingReplacementArgs) {
      await replaceEmbeddings(ctx, embeddingReplacementArgs);
    }

    const updatedProduct = await ctx.db.get(args.productId);
    if (!updatedProduct) {
      throw new Error("Updated product could not be loaded");
    }

    const variants = await getProductVariants(ctx, args.productId);
    return mapProductDetail(updatedProduct, variants);
  },
});

export const create = action({
  args: {
    companyId: v.id("companies"),
    categoryId: v.id("categories"),
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    specifications: v.optional(flexRecord),
    basePrice: v.optional(v.number()),
    baseCurrency: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<ProductDetailDto> => {
    const createContext = await ctx.runQuery(internal.products.getCreateContext, {
      companyId: args.companyId,
      categoryId: args.categoryId,
    });

    if (!createContext.companyExists) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Company not found");
    }

    if (!createContext.categoryExists) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Category not found");
    }

    const productState = normalizeCreateState(args);
    const embeddings = await buildProductEmbeddings(productState);

    return ctx.runMutation(internal.products.insertProductWithEmbeddings, {
      ...args,
      ...embeddings,
    });
  },
});

export const update = action({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    categoryId: v.optional(v.id("categories")),
    nameEn: v.optional(v.string()),
    nameAr: v.optional(v.union(v.string(), v.null())),
    descriptionEn: v.optional(v.union(v.string(), v.null())),
    descriptionAr: v.optional(v.union(v.string(), v.null())),
    specifications: v.optional(v.union(flexRecord, v.null())),
    basePrice: v.optional(v.union(v.number(), v.null())),
    baseCurrency: v.optional(v.union(v.string(), v.null())),
    imageUrls: v.optional(v.union(v.array(v.string()), v.null())),
  },
  handler: async (ctx, args): Promise<ProductDetailDto | null> => {
    const existingProduct = await ctx.runQuery(internal.products.getUpdateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
    });

    if (!existingProduct) {
      return null;
    }

    if (args.categoryId !== undefined) {
      const categoryExists = await ctx.runQuery(internal.products.categoryExistsForCompany, {
        companyId: args.companyId,
        categoryId: args.categoryId,
      });

      if (!categoryExists) {
        throw createTaggedError(NOT_FOUND_PREFIX, "Category not found");
      }
    }

    const nextState = mergeUpdateState(existingProduct, args);
    const embeddings = hasEmbeddingRelevantChanges(existingProduct, nextState)
      ? await buildProductEmbeddings(nextState)
      : null;

    return ctx.runMutation(internal.products.patchProductWithEmbeddings, {
      ...args,
      ...(embeddings ?? {}),
    });
  },
});

export const remove = mutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
  },
  handler: async (ctx, args): Promise<DeleteProductResult | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    for (const variant of variants) {
      await ctx.db.delete(variant._id);
    }

    const embeddings = await ctx.db
      .query("embeddings")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    for (const embedding of embeddings) {
      await ctx.db.delete(embedding._id);
    }

    await ctx.db.delete(args.productId);

    return {
      productId: args.productId,
    };
  },
});
