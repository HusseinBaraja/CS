import type { RetrieveCatalogContextResult } from "./catalogRetrievalTypes";

const ARABIC_NON_WORD_BOUNDARY = String.raw`(?:^|[^\p{Script=Arabic}\p{L}\p{N}_])`;
const ARABIC_NON_WORD_LOOKAHEAD = String.raw`(?=$|[^\p{Script=Arabic}\p{L}\p{N}_])`;

export const PRICE_INTENT_PATTERN = new RegExp(
  [
    String.raw`\bhow much\s+(?:is|does)\b`,
    String.raw`\bwhat(?:'s|\s+is)\s+the\s+price\b`,
    String.raw`\bprice\s+of\b`,
    String.raw`\bcost\s+of\b`,
    String.raw`\bwhat\s+does\b.+\bcost\b`,
    String.raw`${ARABIC_NON_WORD_BOUNDARY}(?:بكم|كم\s+(?:السعر|سعر(?:ه|ها)?|يكلف)|ما\s+(?:هو\s+)?السعر|سعر\s+\S+|تكلفة\s+\S+)${ARABIC_NON_WORD_LOOKAHEAD}`,
  ].join("|"),
  "iu",
);

export const hasPriceIntent = (message: string): boolean => PRICE_INTENT_PATTERN.test(message);

export const retrievalHasAnyPrice = (retrieval: RetrieveCatalogContextResult): boolean =>
  retrieval.candidates.some((candidate) =>
    candidate.product.price !== undefined ||
    candidate.product.variants.some((variant) => variant.price !== undefined)
  );
