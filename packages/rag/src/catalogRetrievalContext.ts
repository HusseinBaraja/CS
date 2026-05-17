import type { ChatLanguage, GroundingContextBlock } from "@cs/ai";
import type {
  HydratedProductRecord,
  RetrievedProductContext,
  VectorSearchHit,
} from "./catalogRetrievalTypes";

const getPreferredName = (
  product: Pick<RetrievedProductContext, "nameEn" | "nameAr">,
  language: ChatLanguage,
): string =>
  language === "ar"
    ? product.nameAr ?? product.nameEn ?? ""
    : product.nameEn ?? product.nameAr ?? "";

const getPreferredDescription = (
  product: Pick<RetrievedProductContext, "descriptionEn" | "descriptionAr">,
  language: ChatLanguage,
): string | undefined =>
  language === "ar"
    ? product.descriptionAr ?? product.descriptionEn
    : product.descriptionEn ?? product.descriptionAr;

const getPrimaryImageLine = (primaryImage: string | undefined): string | undefined => {
  if (!primaryImage) {
    return undefined;
  }

  return primaryImage.startsWith("http://") || primaryImage.startsWith("https://")
    ? `Primary image URL: ${primaryImage}`
    : `Primary image key: ${primaryImage}`;
};

const getPreferredVariantLabel = (
  variant: { labelEn?: string; labelAr?: string },
  language: ChatLanguage,
): string =>
  language === "ar"
    ? variant.labelAr ?? variant.labelEn ?? ""
    : variant.labelEn ?? variant.labelAr ?? "";

export const toRetrievedProductContext = (
  product: HydratedProductRecord,
): RetrievedProductContext => ({
  id: product.id,
  categoryId: product.categoryId,
  ...(product.productNo ? { productNo: product.productNo } : {}),
  ...(product.nameEn ? { nameEn: product.nameEn } : {}),
  ...(product.nameAr ? { nameAr: product.nameAr } : {}),
  ...(product.descriptionEn ? { descriptionEn: product.descriptionEn } : {}),
  ...(product.descriptionAr ? { descriptionAr: product.descriptionAr } : {}),
  ...(product.price !== undefined ? { price: product.price } : {}),
  ...(product.currency ? { currency: product.currency } : {}),
  ...(product.primaryImage ? { primaryImage: product.primaryImage } : {}),
  variants: [...product.variants]
    .sort((left, right) =>
      (left.labelEn ?? left.labelAr ?? "").localeCompare(right.labelEn ?? right.labelAr ?? "") ||
      left.id.localeCompare(right.id)
    )
    .map((variant) => ({
      ...(variant.labelEn ? { labelEn: variant.labelEn } : {}),
      ...(variant.labelAr ? { labelAr: variant.labelAr } : {}),
      ...(variant.price !== undefined ? { price: variant.price } : {}),
    })),
});

const buildContextBlockBody = (
  product: RetrievedProductContext,
  language: ChatLanguage,
): string => {
  const lines: string[] = [];

  if (product.productNo) {
    lines.push(`Product number: ${product.productNo}`);
  }

  if (product.nameEn) {
    lines.push(`Name (EN): ${product.nameEn}`);
  }

  if (product.nameAr) {
    lines.push(`Name (AR): ${product.nameAr}`);
  }

  const description = getPreferredDescription(product, language);
  if (description) {
    lines.push(`Description: ${description}`);
  }

  if (product.price !== undefined) {
    lines.push(`Price: ${product.price}${product.currency ? ` ${product.currency}` : ""}`);
  }

  if (product.variants.length > 0) {
    lines.push("Variants:");
    for (const variant of product.variants) {
      const label = getPreferredVariantLabel(variant, language);
      const variantLine = [
        label ? `- ${label}` : undefined,
        variant.price !== undefined ? `price: ${variant.price}` : undefined,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(" | ");
      if (variantLine) {
        lines.push(variantLine);
      }
    }
  }

  const primaryImageLine = getPrimaryImageLine(product.primaryImage);
  if (primaryImageLine) {
    lines.push(primaryImageLine);
  }

  return lines.join("\n");
};

export const buildContextBlock = (
  product: RetrievedProductContext,
  language: ChatLanguage,
): GroundingContextBlock => ({
  id: product.id,
  heading: getPreferredName(product, language) || product.productNo || product.id,
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
