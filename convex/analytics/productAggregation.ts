import type { Doc } from '../_generated/dataModel';
import { ANALYTICS_PRODUCT_LINKED_EVENT_TYPES, type AnalyticsTopProductDto } from '@cs/shared';

type AnalyticsEventDoc = Doc<'analyticsEvents'>;

type ProductInteractionStats = Map<string, { interactionCount: number; latestTimestamp: number }>;

const productLinkedEventTypes = new Set<string>(ANALYTICS_PRODUCT_LINKED_EVENT_TYPES);

export const createProductInteractionStats = (): ProductInteractionStats => new Map();

const getProductIdFromPayload = (payload: AnalyticsEventDoc['payload']): string | null => {
  const value = payload?.productId;
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const updateProductInteractions = (
  productInteractionStats: ProductInteractionStats,
  event: AnalyticsEventDoc,
): void => {
  if (!productLinkedEventTypes.has(event.eventType)) {
    return;
  }

  const productId = getProductIdFromPayload(event.payload);
  if (!productId) {
    return;
  }

  const currentStats = productInteractionStats.get(productId);
  if (currentStats) {
    currentStats.interactionCount += 1;
    currentStats.latestTimestamp = Math.max(currentStats.latestTimestamp, event.timestamp);
  } else {
    productInteractionStats.set(productId, {
      interactionCount: 1,
      latestTimestamp: event.timestamp,
    });
  }
};

export const getInteractedProductIds = (productInteractionStats: ProductInteractionStats): Set<string> =>
  new Set(Array.from(productInteractionStats.keys()));

export const finalizeProductStats = (
  productInteractionStats: ProductInteractionStats,
  productsById: Map<string, Doc<'products'>>,
): AnalyticsTopProductDto[] =>
  Array.from(productInteractionStats.entries())
    .map(([productId, stats]) => {
      const product = productsById.get(productId);
      if (!product) {
        return null;
      }

      return {
        latestTimestamp: stats.latestTimestamp,
        topProduct: {
          productId,
          ...(product.nameEn ? { nameEn: product.nameEn } : {}),
          ...(product.nameAr ? { nameAr: product.nameAr } : {}),
          interactionCount: stats.interactionCount,
        } satisfies AnalyticsTopProductDto,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (left, right) =>
        right.topProduct.interactionCount - left.topProduct.interactionCount ||
        right.latestTimestamp - left.latestTimestamp ||
        left.topProduct.productId.localeCompare(right.topProduct.productId),
    )
    .slice(0, 5)
    .map((entry) => entry.topProduct);
