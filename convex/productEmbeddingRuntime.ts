import { GEMINI_EMBEDDING_DIMENSIONS, generateGeminiEmbeddings } from '../packages/ai/src/embeddings';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';

export type ProductEmbeddingProductState = {
  companyId: Id<"companies">;
  categoryId: Id<"categories">;
  productNo?: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
};

export type ProductEmbeddingVariantState = {
  id: string;
  productId: string;
  label: string;
  price?: number;
};

export type ProductEmbeddingPayload = {
  englishEmbedding: number[];
  arabicEmbedding: number[];
  englishText: string;
  arabicText: string;
};

const AI_PREFIX = "AI_PROVIDER_FAILED";

const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const sortVariants = <T extends ProductEmbeddingVariantState>(variants: T[]): T[] =>
  variants.sort((left, right) =>
    left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );

const serializeVariants = (variants: ProductEmbeddingVariantState[]): string =>
  sortVariants([...variants])
    .map((variant) =>
      [
        `label:${variant.label}`,
        variant.price !== undefined ? `price:${variant.price}` : undefined,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n"),
    )
    .join("\n---\n");

const buildLanguageEmbeddingText = (
  product: ProductEmbeddingProductState,
  variants: ProductEmbeddingVariantState[],
  language: "en" | "ar",
): string => {
  const nameEn = normalizeOptionalString(product.nameEn);
  const nameAr = normalizeOptionalString(product.nameAr);
  const name =
    language === "en"
      ? nameEn ?? nameAr ?? ""
      : nameAr ?? nameEn ?? "";
  const description =
    language === "en"
      ? normalizeOptionalString(product.descriptionEn)
      : normalizeOptionalString(product.descriptionAr) ?? normalizeOptionalString(product.descriptionEn);

  return [
    `language:${language}`,
    product.productNo ? `sku:${product.productNo}` : undefined,
    name ? `name:${name}` : undefined,
    description ? `description:${description}` : undefined,
    product.price !== undefined ? `price:${product.price}` : undefined,
    product.currency ? `currency:${product.currency}` : undefined,
    variants.length > 0 ? `variants:\n${serializeVariants(variants)}` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
};

export const getCompanyLanguageKey = (
  companyId: Id<"companies">,
  language: "en" | "ar",
): string => `${companyId}:${language}`;

export const buildProductEmbeddingPayload = async (
  product: ProductEmbeddingProductState,
  variants: ProductEmbeddingVariantState[] = [],
): Promise<ProductEmbeddingPayload> => {
  const englishText = buildLanguageEmbeddingText(product, variants, "en");
  const arabicText = buildLanguageEmbeddingText(product, variants, "ar");

  try {
    const [englishEmbedding, arabicEmbedding] = await generateGeminiEmbeddings(
      [englishText, arabicText],
      {
        model: "gemini-embedding-001",
        outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
      },
    );

    return {
      englishEmbedding,
      arabicEmbedding,
      englishText,
      arabicText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini embeddings failed";
    throw new Error(`${AI_PREFIX}: ${message}`);
  }
};

type ReplaceProductEmbeddingsArgs = {
  companyId: Id<"companies">;
  productId: Id<"products">;
  englishEmbedding: number[];
  arabicEmbedding: number[];
  englishText: string;
  arabicText: string;
};

const insertProductEmbeddingsInMutation = async (
  ctx: MutationCtx,
  args: ReplaceProductEmbeddingsArgs,
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

export const replaceProductEmbeddingsInMutation = async (
  ctx: MutationCtx,
  args: ReplaceProductEmbeddingsArgs,
): Promise<void> => {
  const existingEmbeddings = await ctx.db
    .query("embeddings")
    .withIndex("by_product", (q) => q.eq("productId", args.productId))
    .collect();

  for (const embedding of existingEmbeddings) {
    await ctx.db.delete(embedding._id);
  }

  await insertProductEmbeddingsInMutation(ctx, args);
};

export const replaceProductEmbeddings = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    englishEmbedding: v.array(v.float64()),
    arabicEmbedding: v.array(v.float64()),
    englishText: v.string(),
    arabicText: v.string(),
  },
  handler: async (ctx, args): Promise<void> => replaceProductEmbeddingsInMutation(ctx, args),
});

export const mapProductDocToEmbeddingState = (
  product: Doc<"products">,
): ProductEmbeddingProductState => ({
  companyId: product.companyId,
  categoryId: product.categoryId,
  ...(product.productNo ? { productNo: product.productNo } : {}),
  ...(product.nameEn ? { nameEn: product.nameEn } : {}),
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.price !== undefined ? { price: product.price } : {}),
  ...(product.currency ? { currency: product.currency } : {}),
});

export const mapVariantDocToEmbeddingState = (
  variant: Doc<"productVariants">,
): ProductEmbeddingVariantState => ({
  id: variant._id,
  productId: variant.productId,
  label: variant.label,
  ...(variant.price !== undefined ? { price: variant.price } : {}),
});
