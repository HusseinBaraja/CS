import type { ChatLanguage, GroundingContextBlock } from "@cs/ai";
import type {
  HydratedProductRecord,
  RetrievedProductContext,
  VectorSearchHit,
} from "./catalogRetrievalTypes";

const serializeValue = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeValue(entry)).join(", ")}]`;
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${key}: ${serializeValue(entryValue)}`);
    return `{ ${entries.join(", ")} }`;
  }

  return String(value);
};

const getPreferredDescription = (
  product: Pick<RetrievedProductContext, "descriptionEn" | "descriptionAr">,
  language: ChatLanguage,
): string | undefined =>
  language === "ar"
    ? product.descriptionAr ?? product.descriptionEn
    : product.descriptionEn ?? product.descriptionAr;

export const toRetrievedProductContext = (
  product: HydratedProductRecord,
): RetrievedProductContext => ({
  id: product.id,
  categoryId: product.categoryId,
  nameEn: product.nameEn,
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.specifications ? { specifications: product.specifications } : {}),
  ...(product.basePrice !== undefined ? { basePrice: product.basePrice } : {}),
  ...(product.baseCurrency ? { baseCurrency: product.baseCurrency } : {}),
  imageCount: product.images.length,
  variants: [...product.variants]
    .sort((left, right) => left.variantLabel.localeCompare(right.variantLabel) || left.id.localeCompare(right.id))
    .map((variant) => ({
      variantLabel: variant.variantLabel,
      attributes: variant.attributes,
      ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
    })),
});

const buildContextBlockBody = (
  product: RetrievedProductContext,
  language: ChatLanguage,
): string => {
  const lines: string[] = [`Name (EN): ${product.nameEn}`];

  if (product.nameAr) {
    lines.push(`Name (AR): ${product.nameAr}`);
  }

  const description = getPreferredDescription(product, language);
  if (description) {
    lines.push(`Description: ${description}`);
  }

  if (product.basePrice !== undefined) {
    lines.push(
      `Base price: ${product.basePrice}${product.baseCurrency ? ` ${product.baseCurrency}` : ""}`,
    );
  }

  if (product.specifications && Object.keys(product.specifications).length > 0) {
    lines.push("Specifications:");
    for (const [key, value] of Object.entries(product.specifications).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey)
    )) {
      lines.push(`- ${key}: ${String(value)}`);
    }
  }

  if (product.variants.length > 0) {
    lines.push("Variants:");
    for (const variant of product.variants) {
      lines.push(
        [
          `- ${variant.variantLabel}`,
          `attributes: ${serializeValue(variant.attributes)}`,
          variant.priceOverride !== undefined ? `priceOverride: ${variant.priceOverride}` : undefined,
        ]
          .filter((entry): entry is string => Boolean(entry))
          .join(" | "),
      );
    }
  }

  lines.push(`Images available: ${product.imageCount}`);
  return lines.join("\n");
};

export const buildContextBlock = (
  product: RetrievedProductContext,
  language: ChatLanguage,
): GroundingContextBlock => ({
  id: product.id,
  heading: language === "ar" && product.nameAr ? product.nameAr : product.nameEn,
  body: buildContextBlockBody(product, language),
});

export const dedupeHitsByProduct = (hits: VectorSearchHit[]): VectorSearchHit[] => {
  const sortedHits = hits
    .map((hit, index) => ({ hit, index }))
    .sort((left, right) => right.hit._score - left.hit._score || left.index - right.index)
    .map(({ hit }) => hit);
  const seenProductIds = new Set<string>();

  return sortedHits.filter((hit) => {
    if (seenProductIds.has(hit.productId)) {
      return false;
    }
    seenProductIds.add(hit.productId);
    return true;
  });
};
