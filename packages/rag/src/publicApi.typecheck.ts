import type {
  ChatLanguage,
  GroundingContextBlock,
  ProductRetrievalService,
  ProductRetrievalServiceOptions,
  RetrievalOutcome,
  RetrieveCatalogContextInput,
  RetrieveCatalogContextResult,
  RetrievedProductCandidate,
  RetrievedProductContext,
} from './index';
import { buildRetrievalQueryText, createProductRetrievalService, generateRetrievalQueryEmbedding } from './index';

const language: ChatLanguage = "en";
const queryText = buildRetrievalQueryText({
  language,
  query: "Burger Box",
});

const serviceOptions: ProductRetrievalServiceOptions = {
  createClient: () => ({
    action: async () => [],
    query: async () => [],
  }),
  generateEmbedding: async () => Array.from({ length: 768 }, () => 1),
};

const service: ProductRetrievalService = createProductRetrievalService(serviceOptions);

const input: RetrieveCatalogContextInput = {
  companyId: "company-1",
  query: "Burger Box",
  language,
};

const contextBlock: GroundingContextBlock = {
  id: "product-1",
  heading: "Burger Box",
  body: "Name (EN): Burger Box",
};

const retrievedProduct: RetrievedProductContext = {
  id: "product-1",
  categoryId: "category-1",
  nameEn: "Burger Box",
  imageCount: 0,
  variants: [
    {
      variantLabel: "Large",
      attributes: {
        size: "L",
      },
    },
  ],
};

const candidate: RetrievedProductCandidate = {
  productId: "product-1",
  score: 0.9,
  matchedEmbeddingId: "embedding-1",
  matchedText: "English burger box embedding",
  language,
  contextBlock,
  product: retrievedProduct,
};

const outcome: RetrievalOutcome = "grounded";

const resultPromise: Promise<RetrieveCatalogContextResult> = service.retrieveCatalogContext(input);
const embeddingPromise: Promise<number[]> = generateRetrievalQueryEmbedding({
  language,
  query: "Burger Box",
});

void language;
void queryText;
void serviceOptions;
void service;
void input;
void contextBlock;
void retrievedProduct;
void candidate;
void outcome;
void resultPromise;
void embeddingPromise;
