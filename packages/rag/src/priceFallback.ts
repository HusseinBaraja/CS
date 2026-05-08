import type { RetrieveCatalogContextResult } from "./catalogRetrievalTypes";

export const PRICE_INTENT_PATTERN =
  /(\b(price|cost|how much|rate|pricing)\b|بكم|كم السعر|السعر|سعر|تكلفة|كم يكلف)/i;

export const hasPriceIntent = (message: string): boolean => PRICE_INTENT_PATTERN.test(message);

export const retrievalHasAnyPrice = (retrieval: RetrieveCatalogContextResult): boolean =>
  retrieval.candidates.some((candidate) =>
    candidate.product.price !== undefined ||
    candidate.product.variants.some((variant) => variant.price !== undefined)
  );
