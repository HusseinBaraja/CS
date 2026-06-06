import type { ChatLanguage, GroundingContextBlock } from "@cs/ai";
import type { ConvexAdminClient, Id } from "@cs/db";
import type { RetrievalMode, RetrievalQueryProvenance } from "./retrievalRewrite";

export type RetrievalReason = "empty_query" | "no_hits" | "below_min_score";

export type RetrievalEmbeddingGenerator = (
  text: string,
  options?: {
    apiKey?: string;
    outputDimensionality?: number;
  },
) => Promise<number[]>;

export type VectorSearchHit = {
  _id: Id<"embeddings">;
  _score: number;
  productId: Id<"products">;
  textContent: string;
  language: ChatLanguage;
};

export type ProductVariantRecord = {
  id: string;
  companyId: string;
  productId: string;
  labelEn?: string;
  labelAr?: string;
  price?: number;
};

export type HydratedProductRecord = {
  id: string;
  companyId: string;
  categoryId: string;
  productNo?: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
  primaryImage?: string;
  variants: ProductVariantRecord[];
};

export type RetrievalOutcome = "grounded" | "empty" | "low_signal";

export interface RetrieveCatalogContextInput {
  companyId: Id<"companies">;
  query: string;
  language: ChatLanguage;
  maxResults?: number;
  maxContextBlocks?: number;
  minScore?: number;
}

export interface RetrievedProductContext {
  id: string;
  categoryId: string;
  productNo?: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
  primaryImage?: string;
  variants: Array<{
    labelEn?: string;
    labelAr?: string;
    price?: number;
  }>;
}

export interface RetrievedProductCandidate {
  productId: string;
  score: number;
  matchedEmbeddingId: string;
  matchedText: string;
  language: ChatLanguage;
  contextBlock: GroundingContextBlock;
  product: RetrievedProductContext;
  queryProvenance?: RetrievalQueryProvenance[];
}

export interface RetrieveCatalogContextResult {
  outcome: RetrievalOutcome;
  reason?: RetrievalReason;
  query: string;
  language: ChatLanguage;
  topScore?: number;
  candidates: RetrievedProductCandidate[];
  contextBlocks: GroundingContextBlock[];
  retrievalMode?: RetrievalMode;
}

export interface GenerateRetrievalQueryEmbeddingInput {
  query: string;
  language: ChatLanguage;
  apiKey?: string;
}

export interface GenerateRetrievalQueryEmbeddingOptions {
  generateEmbedding?: RetrievalEmbeddingGenerator;
}

export interface ProductRetrievalService {
  retrieveCatalogContext(
    input: RetrieveCatalogContextInput,
  ): Promise<RetrieveCatalogContextResult>;
}

export interface ProductRetrievalServiceOptions {
  createClient?: () => ConvexAdminClient;
  generateEmbedding?: RetrievalEmbeddingGenerator;
}
