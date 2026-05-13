import { describe, expect, test } from "bun:test";
import type { RetrieveCatalogContextResult } from "./catalogRetrievalTypes";
import { hasPriceIntent, retrievalHasAnyPrice } from "./priceFallback";

const buildRetrieval = (
  candidates: RetrieveCatalogContextResult["candidates"],
): RetrieveCatalogContextResult => ({
  outcome: "grounded",
  query: "shoes",
  language: "en",
  candidates,
  contextBlocks: [],
});

const buildCandidate = (
  product: Partial<RetrieveCatalogContextResult["candidates"][number]["product"]>,
): RetrieveCatalogContextResult["candidates"][number] => ({
  productId: "product-1",
  score: 0.9,
  matchedEmbeddingId: "embedding-1",
  matchedText: "shoes",
  language: "en",
  contextBlock: {
    id: "product-1",
    heading: "Shoes",
    body: "Shoes",
  },
  product: {
    id: "product-1",
    categoryId: "category-1",
    variants: [],
    ...product,
  },
});

describe("priceFallback", () => {
  test("detects English and Arabic price intent", () => {
    expect(hasPriceIntent("How much is this?")).toBe(true);
    expect(hasPriceIntent("How much does this cost?")).toBe(true);
    expect(hasPriceIntent("what is the price")).toBe(true);
    expect(hasPriceIntent("price of the red dress")).toBe(true);
    expect(hasPriceIntent("كم السعر؟")).toBe(true);
    expect(hasPriceIntent("سعر المنتج")).toBe(true);
    expect(hasPriceIntent("كم يكلف المنتج؟")).toBe(true);
    expect(hasPriceIntent("how much time do you need?")).toBe(false);
    expect(hasPriceIntent("how much can it carry?")).toBe(false);
    expect(hasPriceIntent("كم سعرات المنتج؟")).toBe(false);
    expect(hasPriceIntent("هل يوجد مقاس كبير؟")).toBe(false);
  });

  test("detects prices on products and variants", () => {
    expect(retrievalHasAnyPrice(buildRetrieval([buildCandidate({ price: 12 })]))).toBe(true);
    expect(
      retrievalHasAnyPrice(
        buildRetrieval([buildCandidate({ variants: [{ labelEn: "Large", price: 13 }] })]),
      ),
    ).toBe(true);
    expect(retrievalHasAnyPrice(buildRetrieval([buildCandidate({ variants: [{ labelEn: "Large" }] })]))).toBe(
      false,
    );
  });
});
