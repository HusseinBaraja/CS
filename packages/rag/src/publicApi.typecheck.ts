import type {
  AssistantStructuredOutput,
  CatalogChatInput,
  CatalogChatOrchestrator,
  CatalogChatResult,
  CatalogChatTenantContext,
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
import type { ConvexAdminClient, Id } from '@cs/db';
import {
  buildRetrievalQueryText,
  createCatalogChatOrchestrator,
  createProductRetrievalService,
  generateRetrievalQueryEmbedding,
} from './index';

const language: ChatLanguage = "en";
const companyId = "company-1" as Id<"companies">;
const queryText = buildRetrievalQueryText({
  language,
  query: "Burger Box",
});

const serviceOptions: ProductRetrievalServiceOptions = {
  createClient: () => ({
    action: async () => [],
    mutation: async () => {
      throw new Error("mutation not used in public API typecheck");
    },
    query: async () => [],
  }) as ConvexAdminClient,
  generateEmbedding: async () => Array.from({ length: 768 }, () => 1),
};

const service: ProductRetrievalService = createProductRetrievalService(serviceOptions);
const tenant: CatalogChatTenantContext = {
  companyId,
  preferredLanguage: "en",
};

const input: RetrieveCatalogContextInput = {
  companyId,
  query: "Burger Box",
  language,
  conversationHistory: [
    {
      role: "user",
      text: "Hello",
    },
  ],
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
const catalogChatInput: CatalogChatInput = {
  tenant,
  conversation: {
    conversationId: "conversation-1",
    history: [
      {
        role: "user",
        text: "Hello",
      },
    ],
    allowedActions: ["none", "clarify"],
  },
  userMessage: "Burger Box",
  requestId: "request-1",
  retrieval: {
    maxResults: 3,
  },
  provider: {
    timeoutMs: 2_000,
  },
};
const orchestrator: CatalogChatOrchestrator = createCatalogChatOrchestrator({
  retrievalService: service,
  chatManager: {
    chat: async () => ({
      provider: "gemini",
      text: '{"schemaVersion":"v1","text":"We have burger boxes.","action":{"type":"none"}}',
      finishReason: "stop",
    }),
    probeProviders: async () => [],
  },
});
const catalogChatResultPromise: Promise<CatalogChatResult> = orchestrator.respond(catalogChatInput);
const assistant: AssistantStructuredOutput = {
  schemaVersion: "v1",
  text: "We have burger boxes.",
  action: {
    type: "none",
  },
};

void language;
void companyId;
void tenant;
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
void catalogChatInput;
void orchestrator;
void catalogChatResultPromise;
void assistant;
