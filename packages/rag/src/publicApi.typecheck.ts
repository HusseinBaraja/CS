import type {
  AssistantStructuredOutput,
  CatalogChatInput,
  CatalogChatOrchestrator,
  CatalogChatResult,
  CatalogChatTenantContext,
  CatalogGroundingBundle,
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
};

const contextBlock: GroundingContextBlock = {
  id: "product-1",
  heading: "Burger Box",
  body: "Name (EN): Burger Box",
};
const groundingBundle: CatalogGroundingBundle = {
  bundleId: "bundle-1",
  retrievalMode: "raw_latest_message",
  resolvedQuery: "Burger Box",
  entityRefs: [
    {
      entityKind: "product",
      entityId: "product-1",
    },
  ],
  contextBlocks: [contextBlock],
  language,
  retrievalConfidence: 0.9,
  products: [
    {
      id: "product-1",
      name: "Burger Box",
    },
  ],
  categories: [],
  variants: [],
  offers: [],
  pricingFacts: [],
  imageAvailability: [],
  omissions: [],
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
    recentTurns: [
      {
        role: "user",
        text: "Hello",
      },
    ],
    quotedReference: {
      role: "assistant",
      text: "Burger Box",
    },
    semanticAssistantRecords: [{
      semanticRecordId: "semantic-record-1",
      assistantMessageId: "assistant-message-1",
      actionType: "none",
      responseMode: "grounded",
      orderedPresentedEntityIds: [],
      referencedEntities: [],
      createdAt: 1_000,
    }],
    summary: null,
    resolutionPolicy: {
      allowModelAssistedFallback: false,
      allowSemanticAssistantFallback: true,
      allowSummarySupport: true,
      staleContextWindowMs: 1_800_000,
      quotedReferenceOverridesStaleness: true,
      minimumConfidenceToProceed: "high",
      allowMediumConfidenceProceed: false,
      maxSemanticFallbackDepth: 3,
    },
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
void groundingBundle;
void retrievedProduct;
void candidate;
void outcome;
void resultPromise;
void embeddingPromise;
void catalogChatInput;
void orchestrator;
void catalogChatResultPromise;
void assistant;
