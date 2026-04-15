import type {
  AssistantStructuredOutput,
  CatalogLanguageHints,
  CatalogLanguageHintsService,
  CatalogChatInput,
  CatalogChatConversationHistorySelection,
  CatalogChatOrchestrator,
  CatalogChatResult,
  CatalogChatTenantContext,
  ChatLanguage,
  GroundingContextBlock,
  RetrievalQueryPlan,
  RetrievalRewriteAttempt,
  RetrievalRewriteInput,
  RetrievalRewriteResult,
  RetrievalRewriteService,
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
  buildRetrievalQueryPlan,
  buildRetrievalQueryText,
  buildRetrievalRewriteInput,
  createCatalogLanguageHintsService,
  createCatalogChatOrchestrator,
  createProductRetrievalService,
  createRetrievalRewriteService,
  generateRetrievalQueryEmbedding,
  parseRetrievalRewriteResult,
  summarizePromptRetrievalProvenance,
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
const historySelection: CatalogChatConversationHistorySelection = {
  reason: "recent_window",
};
const rewriteInput: RetrievalRewriteInput = buildRetrievalRewriteInput({
  userMessage: "Burger Box",
  conversation: {
    history: [
      {
        role: "user",
        text: "Show me food boxes",
      },
    ],
    historySelection,
  },
  responseLanguageHint: "en",
  catalogLanguageHints: {
    primaryCatalogLanguage: "mixed",
    supportedLanguages: ["ar", "en"],
    preferredTermPreservation: "mixed",
  },
});
const rewriteResult: RetrievalRewriteResult = parseRetrievalRewriteResult(
  '{"resolvedQuery":"Burger Box","confidence":"high","rewriteStrategy":"standalone","preservedTerms":["Burger Box"]}',
);
const rewriteAttempt: RetrievalRewriteAttempt = {
  status: "success",
  result: rewriteResult,
};
const rewriteService: RetrievalRewriteService = createRetrievalRewriteService();
const catalogLanguageHints: CatalogLanguageHints = {
  primaryCatalogLanguage: "mixed",
  supportedLanguages: ["ar", "en"],
  preferredTermPreservation: "mixed",
};
const catalogLanguageHintsService: CatalogLanguageHintsService = createCatalogLanguageHintsService();
const queryPlan: RetrievalQueryPlan = buildRetrievalQueryPlan({
  userMessage: "Burger Box",
  rewriteAttempt,
});
const promptRetrievalProvenance = summarizePromptRetrievalProvenance({
  mode: queryPlan.mode,
  promptCandidateCount: 0,
  candidates: [],
});

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
    historySelection,
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
void historySelection;
void rewriteInput;
void rewriteResult;
void rewriteAttempt;
void rewriteService;
void catalogLanguageHints;
void catalogLanguageHintsService;
void queryPlan;
void promptRetrievalProvenance;
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
