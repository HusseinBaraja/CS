import { GEMINI_EMBEDDING_DIMENSIONS, generateGeminiEmbeddings } from '@cs/ai';
import { v } from 'convex/values';
import { enqueueCleanupJobInMutation } from './mediaCleanup';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type MutationCtx } from './_generated/server';

const flexValue = v.union(v.string(), v.number(), v.boolean());
const flexRecord = v.record(v.string(), flexValue);
const variantAttributesValidator = v.record(v.string(), v.any());

type ProductSpecifications = Record<string, string | number | boolean>;
type ProductVariantAttributeValue =
  | string
  | number
  | boolean
  | null
  | ProductVariantAttributeValue[]
  | ProductVariantAttributes;
interface ProductVariantAttributes {
  [key: string]: ProductVariantAttributeValue;
}

type ProductVariantDto = {
  id: string;
  productId: string;
  variantLabel: string;
  attributes: ProductVariantAttributes;
  priceOverride?: number;
};

type ProductImageDto = {
  id: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  etag?: string;
  alt?: string;
  uploadedAt: number;
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
  images: ProductImageDto[];
};

type ProductDetailDto = ProductListItemDto & {
  variants: ProductVariantDto[];
};

type DeleteProductResult = {
  productId: string;
};

type DeleteProductVariantResult = {
  productId: string;
  variantId: string;
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
};

type ProductWriteSnapshot = ProductWriteState & {
  productId: Id<"products">;
  expectedRevision: number;
};

type ProductVariantWriteState = {
  id: string;
  productId: string;
  variantLabel: string;
  attributes: ProductVariantAttributes;
  priceOverride?: number;
};

type ProductVariantCreateArgs = {
  companyId: Id<"companies">;
  productId: Id<"products">;
  variantLabel: string;
  attributes: ProductVariantAttributes;
  priceOverride?: number;
};

type ProductVariantUpdateArgs = {
  companyId: Id<"companies">;
  productId: Id<"products">;
  variantId: Id<"productVariants">;
  variantLabel?: string;
  attributes?: ProductVariantAttributes;
  priceOverride?: number | null;
};

type ProductVariantCreateSnapshot = ProductWriteSnapshot & {
  variants: ProductVariantDto[];
};

type ProductVariantUpdateSnapshot = ProductVariantCreateSnapshot & {
  targetVariant: ProductVariantDto | null;
};

type ProductReader = {
  db: Pick<MutationCtx["db"], "get" | "query">;
};

const AI_PREFIX = "AI_PROVIDER_FAILED";
const CONFLICT_PREFIX = "CONFLICT";
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

const normalizeVariantAttributeValue = (
  value: ProductVariantAttributeValue,
  path: string,
): ProductVariantAttributeValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw createTaggedError(VALIDATION_PREFIX, `${path} must be a finite number`);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entryValue, index) =>
      normalizeVariantAttributeValue(entryValue, `${path}[${index}]`),
    );
  }

  if (typeof value === "object" && value !== null) {
    return normalizeVariantAttributes(value as ProductVariantAttributes, path);
  }

  throw createTaggedError(
    VALIDATION_PREFIX,
    `${path} must be a string, number, boolean, null, object, or array`,
  );
};

const normalizeVariantAttributes = (
  value: ProductVariantAttributes,
  path = "attributes",
): ProductVariantAttributes => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw createTaggedError(VALIDATION_PREFIX, `${path} must be an object`);
  }

  const attributes: ProductVariantAttributes = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) {
      throw createTaggedError(VALIDATION_PREFIX, `${path} keys must be non-empty strings`);
    }

    if (normalizedKey in attributes) {
      throw createTaggedError(
        VALIDATION_PREFIX,
        `${path} keys must be unique after trimming: ${normalizedKey}`,
      );
    }

    attributes[normalizedKey] = normalizeVariantAttributeValue(
      entryValue as ProductVariantAttributeValue,
      `${path}.${normalizedKey}`,
    );
  }

  return attributes;
};

const normalizeVariantCreateState = (
  args: Pick<ProductVariantCreateArgs, "productId" | "variantLabel" | "attributes" | "priceOverride">,
): ProductVariantWriteState => {
  const normalizedPriceOverride = normalizeOptionalNumber(args.priceOverride, "priceOverride");

  return {
    id: "~new",
    productId: args.productId,
    variantLabel: normalizeRequiredString(args.variantLabel, "variantLabel"),
    attributes: normalizeVariantAttributes(args.attributes),
    ...(normalizedPriceOverride !== undefined ? { priceOverride: normalizedPriceOverride } : {}),
  };
};

const mergeVariantUpdateState = (
  existingVariant: ProductVariantWriteState,
  patch: Pick<ProductVariantUpdateArgs, "variantLabel" | "attributes" | "priceOverride">,
): ProductVariantWriteState => {
  const normalizedPriceOverride =
    patch.priceOverride !== undefined
      ? normalizeOptionalNumber(patch.priceOverride, "priceOverride")
      : undefined;

  return {
    id: existingVariant.id,
    productId: existingVariant.productId,
    variantLabel:
      patch.variantLabel !== undefined
        ? normalizeRequiredString(patch.variantLabel, "variantLabel")
        : existingVariant.variantLabel,
    attributes:
      patch.attributes !== undefined
        ? normalizeVariantAttributes(patch.attributes)
        : existingVariant.attributes,
    ...(patch.priceOverride !== undefined
      ? (normalizedPriceOverride !== undefined ? { priceOverride: normalizedPriceOverride } : {})
      : (existingVariant.priceOverride !== undefined ? { priceOverride: existingVariant.priceOverride } : {})),
  };
};

const createVariantPatch = (
  args: Pick<ProductVariantUpdateArgs, "variantLabel" | "attributes" | "priceOverride">,
): {
  variantLabel?: string;
  attributes?: ProductVariantAttributes;
  priceOverride?: number | undefined;
} => {
  const patch: {
    variantLabel?: string;
    attributes?: ProductVariantAttributes;
    priceOverride?: number | undefined;
  } = {};

  if (args.variantLabel !== undefined) {
    patch.variantLabel = normalizeRequiredString(args.variantLabel, "variantLabel");
  }

  if (args.attributes !== undefined) {
    patch.attributes = normalizeVariantAttributes(args.attributes);
  }

  if (args.priceOverride !== undefined) {
    patch.priceOverride = normalizeOptionalNumber(args.priceOverride, "priceOverride");
  }

  return patch;
};

const mapVariant = (variant: Doc<"productVariants">): ProductVariantDto => ({
  id: variant._id,
  productId: variant.productId,
  variantLabel: variant.variantLabel,
  attributes: variant.attributes as ProductVariantAttributes,
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
});

const mapImage = (
  image: {
    id: string;
    key: string;
    contentType: string;
    sizeBytes: number;
    etag?: string;
    alt?: string;
    uploadedAt: number;
  },
): ProductImageDto => ({
  id: image.id,
  key: image.key,
  contentType: image.contentType,
  sizeBytes: image.sizeBytes,
  ...(image.etag ? { etag: image.etag } : {}),
  ...(image.alt ? { alt: image.alt } : {}),
  uploadedAt: image.uploadedAt,
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
  images: (product.images ?? []).map(mapImage),
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
});

const toVariantWriteState = (variant: ProductVariantDto): ProductVariantWriteState => ({
  id: variant.id,
  productId: variant.productId,
  variantLabel: variant.variantLabel,
  attributes: variant.attributes,
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
});

const sortProducts = <T extends ProductListItemDto>(products: T[]): T[] =>
  products.sort((left, right) => left.nameEn.localeCompare(right.nameEn) || left.id.localeCompare(right.id));

const sortVariantDocs = <T extends { variantLabel: string; _id: string }>(variants: T[]): T[] =>
  variants.sort((left, right) =>
    left.variantLabel.localeCompare(right.variantLabel) || left._id.localeCompare(right._id)
  );

const sortVariants = <T extends ProductVariantWriteState | ProductVariantDto>(variants: T[]): T[] =>
  variants.sort((left, right) =>
    left.variantLabel.localeCompare(right.variantLabel) || left.id.localeCompare(right.id)
  );

const serializeSpecifications = (specifications: ProductSpecifications | undefined): string =>
  specifications
    ? Object.entries(specifications)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join("\n")
    : "";

const serializeVariantAttributeValue = (value: ProductVariantAttributeValue): string => {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeVariantAttributeValue).join(", ")}]`;
  }

  return `{ ${Object.entries(value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entryValue]) => `${key}: ${serializeVariantAttributeValue(entryValue)}`)
    .join(", ")} }`;
};

const serializeVariantAttributes = (attributes: ProductVariantAttributes): string =>
  Object.entries(attributes)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}: ${serializeVariantAttributeValue(value)}`)
    .join(", ");

const serializeVariants = (variants: ProductVariantWriteState[]): string =>
  sortVariants([...variants])
    .map((variant) =>
      [
        `variantLabel:${variant.variantLabel}`,
        variant.priceOverride !== undefined ? `priceOverride:${variant.priceOverride}` : undefined,
        `attributes:${serializeVariantAttributes(variant.attributes)}`,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n"),
    )
    .join("\n---\n");

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
  variants: ProductVariantWriteState[],
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
    variants.length > 0 ? `variants:\n${serializeVariants(variants)}` : undefined,
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
  variants: ProductVariantWriteState[] = [],
): Promise<{
  englishEmbedding: number[];
  arabicEmbedding: number[];
  englishText: string;
  arabicText: string;
}> => {
  const englishText = buildLanguageEmbeddingText(product, variants, "en");
  const arabicText = buildLanguageEmbeddingText(product, variants, "ar");

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

const getScopedVariant = async (
  ctx: ProductReader,
  productId: Id<"products">,
  variantId: Id<"productVariants">,
): Promise<Doc<"productVariants"> | null> => {
  const variant = await ctx.db.get(variantId);
  if (!variant || variant.productId !== productId) {
    return null;
  }

  return variant;
};

const getProductVariants = async (
  ctx: ProductReader,
  productId: Id<"products">,
): Promise<Doc<"productVariants">[]> =>
  sortVariantDocs(
    await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect(),
  );

const getVariantCreateSnapshotData = async (
  ctx: ProductReader,
  companyId: Id<"companies">,
  productId: Id<"products">,
): Promise<ProductVariantCreateSnapshot | null> => {
  const product = await getScopedProduct(ctx, companyId, productId);
  if (!product) {
    return null;
  }

  const variants = await getProductVariants(ctx, productId);
  return {
    productId: product._id,
    expectedRevision: product.revision ?? 0,
    ...toWriteState(product),
    variants: variants.map(mapVariant),
  };
};

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

  return patch;
};

export const list = internalQuery({
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

export const get = internalQuery({
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

export const getManyForRag = internalQuery({
  args: {
    companyId: v.id("companies"),
    productIds: v.array(v.id("products")),
  },
  handler: async (ctx, args): Promise<ProductDetailDto[]> => {
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
        const product = await getScopedProduct(ctx, args.companyId, productId);
        if (!product) {
          return null;
        }

        const variants = await getProductVariants(ctx, productId);
        return mapProductDetail(product, variants);
      }),
    );

    return results.filter((result): result is ProductDetailDto => result !== null);
  },
});

export const listVariants = internalQuery({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
  },
  handler: async (ctx, args): Promise<ProductVariantDto[] | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const variants = await getProductVariants(ctx, args.productId);
    return variants.map(mapVariant);
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
      expectedRevision: product.revision ?? 0,
      ...toWriteState(product),
    };
  },
});

export const getVariantCreateSnapshot = internalQuery({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
  },
  handler: async (ctx, args): Promise<ProductVariantCreateSnapshot | null> =>
    getVariantCreateSnapshotData(ctx, args.companyId, args.productId),
});

export const getVariantUpdateSnapshot = internalQuery({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    variantId: v.id("productVariants"),
  },
  handler: async (ctx, args): Promise<ProductVariantUpdateSnapshot | null> => {
    const productSnapshot = await getVariantCreateSnapshotData(ctx, args.companyId, args.productId);
    if (!productSnapshot) {
      return null;
    }

    return {
      ...productSnapshot,
      targetVariant: productSnapshot.variants.find((variant) => variant.id === args.variantId) ?? null,
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
      revision: 1,
      nameEn: productState.nameEn,
      ...(productState.nameAr ? { nameAr: productState.nameAr } : {}),
      ...(productState.descriptionEn ? { descriptionEn: productState.descriptionEn } : {}),
      ...(productState.descriptionAr ? { descriptionAr: productState.descriptionAr } : {}),
      ...(productState.specifications ? { specifications: productState.specifications } : {}),
      ...(productState.basePrice !== undefined ? { basePrice: productState.basePrice } : {}),
      ...(productState.baseCurrency ? { baseCurrency: productState.baseCurrency } : {}),
      images: [],
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
    expectedRevision: v.number(),
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

    if ((existingProduct.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, "Product was modified concurrently; retry the update");
    }

    if (args.categoryId !== undefined) {
      const category = await getScopedCategory(ctx, args.companyId, args.categoryId);
      if (!category) {
        throw createTaggedError(NOT_FOUND_PREFIX, "Category not found");
      }
    }

    const patch = createProductPatch(args);
    await ctx.db.patch(args.productId, {
      ...patch,
      revision: args.expectedRevision + 1,
    });

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

export const insertVariantWithEmbeddings = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    variantLabel: v.string(),
    attributes: variantAttributesValidator,
    priceOverride: v.optional(v.number()),
    expectedRevision: v.number(),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (ctx, args): Promise<ProductVariantDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    if ((product.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, "Product was modified concurrently; retry the update");
    }

    const variantState = normalizeVariantCreateState(args);
    const variantId = await ctx.db.insert("productVariants", {
      productId: args.productId,
      variantLabel: variantState.variantLabel,
      attributes: variantState.attributes,
      ...(variantState.priceOverride !== undefined ? { priceOverride: variantState.priceOverride } : {}),
    });

    await ctx.db.patch(args.productId, {
      revision: args.expectedRevision + 1,
    });

    await replaceEmbeddings(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });

    const variant = await ctx.db.get(variantId);
    if (!variant) {
      throw new Error("Created variant could not be loaded");
    }

    return mapVariant(variant);
  },
});

export const patchVariantWithEmbeddings = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    variantId: v.id("productVariants"),
    variantLabel: v.optional(v.string()),
    attributes: v.optional(variantAttributesValidator),
    priceOverride: v.optional(v.union(v.number(), v.null())),
    expectedRevision: v.number(),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (ctx, args): Promise<ProductVariantDto | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    if ((product.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, "Product was modified concurrently; retry the update");
    }

    const existingVariant = await getScopedVariant(ctx, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Variant not found");
    }

    const patch = createVariantPatch(args);
    await ctx.db.patch(args.variantId, patch);
    await ctx.db.patch(args.productId, {
      revision: args.expectedRevision + 1,
    });

    await replaceEmbeddings(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });

    const updatedVariant = await ctx.db.get(args.variantId);
    if (!updatedVariant) {
      throw new Error("Updated variant could not be loaded");
    }

    return mapVariant(updatedVariant);
  },
});

export const removeVariantWithEmbeddings = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    variantId: v.id("productVariants"),
    expectedRevision: v.number(),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (ctx, args): Promise<DeleteProductVariantResult | null> => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    if ((product.revision ?? 0) !== args.expectedRevision) {
      throw createTaggedError(CONFLICT_PREFIX, "Product was modified concurrently; retry the update");
    }

    const existingVariant = await getScopedVariant(ctx, args.productId, args.variantId);
    if (!existingVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Variant not found");
    }

    await ctx.db.delete(args.variantId);
    await ctx.db.patch(args.productId, {
      revision: args.expectedRevision + 1,
    });

    await replaceEmbeddings(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      englishEmbedding: args.englishEmbedding,
      arabicEmbedding: args.arabicEmbedding,
      englishText: args.englishText,
      arabicText: args.arabicText,
    });

    return {
      productId: args.productId,
      variantId: args.variantId,
    };
  },
});

export const create = internalAction({
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

export const update = internalAction({
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
    const variants = hasEmbeddingRelevantChanges(existingProduct, nextState)
      ? await ctx.runQuery(internal.products.listVariants, {
        companyId: args.companyId,
        productId: args.productId,
      })
      : null;
    const embeddings = hasEmbeddingRelevantChanges(existingProduct, nextState)
      ? await buildProductEmbeddings(nextState, (variants ?? []).map(toVariantWriteState))
      : null;

    if (!embeddings) {
      return ctx.runMutation(internal.products.patchProductWithEmbeddings, {
        ...args,
        expectedRevision: existingProduct.expectedRevision,
      });
    }

    return ctx.runMutation(internal.products.patchProductWithEmbeddings, {
      ...args,
      expectedRevision: existingProduct.expectedRevision,
      ...embeddings,
    });
  },
});

export const createVariant = internalAction({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    variantLabel: v.string(),
    attributes: variantAttributesValidator,
    priceOverride: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProductVariantDto | null> => {
    const snapshot = await ctx.runQuery(internal.products.getVariantCreateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
    });

    if (!snapshot) {
      return null;
    }

    const nextVariant = normalizeVariantCreateState(args);
    const embeddings = await buildProductEmbeddings(snapshot, sortVariants([
      ...snapshot.variants.map(toVariantWriteState),
      nextVariant,
    ]));

    return ctx.runMutation(internal.products.insertVariantWithEmbeddings, {
      ...args,
      expectedRevision: snapshot.expectedRevision,
      ...embeddings,
    });
  },
});

export const updateVariant = internalAction({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    variantId: v.id("productVariants"),
    variantLabel: v.optional(v.string()),
    attributes: v.optional(variantAttributesValidator),
    priceOverride: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args): Promise<ProductVariantDto | null> => {
    const snapshot = await ctx.runQuery(internal.products.getVariantUpdateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
      variantId: args.variantId,
    });

    if (!snapshot) {
      return null;
    }

    if (!snapshot.targetVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Variant not found");
    }

    const nextVariant = mergeVariantUpdateState(toVariantWriteState(snapshot.targetVariant), args);
    const embeddings = await buildProductEmbeddings(
      snapshot,
      sortVariants(
        snapshot.variants.map((variant: ProductVariantDto) =>
          variant.id === args.variantId ? nextVariant : toVariantWriteState(variant)
        ),
      ),
    );

    return ctx.runMutation(internal.products.patchVariantWithEmbeddings, {
      ...args,
      expectedRevision: snapshot.expectedRevision,
      ...embeddings,
    });
  },
});

export const removeVariant = internalAction({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    variantId: v.id("productVariants"),
  },
  handler: async (ctx, args): Promise<DeleteProductVariantResult | null> => {
    const snapshot = await ctx.runQuery(internal.products.getVariantUpdateSnapshot, {
      companyId: args.companyId,
      productId: args.productId,
      variantId: args.variantId,
    });

    if (!snapshot) {
      return null;
    }

    if (!snapshot.targetVariant) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Variant not found");
    }

    const embeddings = await buildProductEmbeddings(
      snapshot,
      snapshot.variants
        .filter((variant: ProductVariantDto) => variant.id !== args.variantId)
        .map(toVariantWriteState),
    );

    return ctx.runMutation(internal.products.removeVariantWithEmbeddings, {
      ...args,
      expectedRevision: snapshot.expectedRevision,
      ...embeddings,
    });
  },
});

export const remove = internalMutation({
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

    for (const image of product.images ?? []) {
      await enqueueCleanupJobInMutation(ctx, {
        companyId: args.companyId,
        productId: args.productId,
        imageId: image.id,
        objectKey: image.key,
        reason: "product_deleted",
      });
    }

    await ctx.db.delete(args.productId);

    return {
      productId: args.productId,
    };
  },
});
