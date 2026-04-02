import type {
  AssistantStructuredOutput,
  PromptAssemblyInput,
  PromptAssemblyOutput,
  ChatLanguage,
  ChatProviderHealth,
  ChatProviderAdapter,
  ChatProviderManager,
  ChatRequest,
  ChatResponse,
  LanguageDetectionResult,
} from '@cs/ai';
import { assemblePrompt, detectChatLanguage } from '@cs/ai';
import type { Id } from '@cs/db';
import type {
  CatalogChatInput,
  CatalogChatOrchestrator,
  CatalogChatResult,
  ProductRetrievalService,
} from '@cs/rag';
import { createCatalogChatOrchestrator } from '@cs/rag';

const companyId = "company-1" as Id<"companies">;
const request: ChatRequest = {
  messages: [
    {
      role: "user",
      content: "bootstrap",
    },
  ],
};

const response: ChatResponse = {
  provider: "groq",
  text: "ready",
  finishReason: "stop",
};

const adapter: ChatProviderAdapter = {
  provider: "groq",
  async chat(normalizedRequest) {
    return {
      provider: "groq",
      text: normalizedRequest.messages[0]?.content[0]?.text ?? "",
      finishReason: "stop",
    };
  },
  async healthCheck() {
    return {
      provider: "groq",
      ok: true,
    };
  },
};

const language: ChatLanguage = "ar";
const detection: LanguageDetectionResult = detectChatLanguage("مرحبا", {
  preferredLanguage: language,
});
const promptInput: PromptAssemblyInput = {
  behaviorInstructions: {
    responseLanguage: language,
    groundingPolicy: "supplied_facts_only",
    ambiguityPolicy: "clarify_instead_of_guessing",
    handoffPolicy: "handoff_on_explicit_request_or_unsafe_help",
    offTopicPolicy: "refuse",
    stylePolicy: "concise_target_language",
    responseFormat: "assistant_structured_output_v1",
  },
  conversationSummary: null,
  conversationState: null,
  recentTurns: [],
  groundingBundle: null,
  currentUserTurn: {
    text: "مرحبا",
  },
};
const prompt: PromptAssemblyOutput = assemblePrompt(promptInput);
const retrievalService: ProductRetrievalService = {
  async retrieveCatalogContext() {
    return {
      outcome: "grounded",
      query: "مرحبا",
      language: "ar",
      topScore: 0.9,
      candidates: [
        {
          productId: "product-1",
          score: 0.9,
          matchedEmbeddingId: "embedding-1",
          matchedText: "Arabic burger box embedding",
          language: "ar",
          contextBlock: {
            id: "product-1",
            heading: "علبة برجر",
            body: "Name (AR): علبة برجر",
          },
          product: {
            id: "product-1",
            categoryId: "category-1",
            nameEn: "Burger Box",
            nameAr: "علبة برجر",
            imageCount: 0,
            variants: [],
          },
        },
      ],
      contextBlocks: [
        {
          id: "product-1",
          heading: "علبة برجر",
          body: "Name (AR): علبة برجر",
        },
      ],
    };
  },
};
const chatManager: ChatProviderManager = {
  async chat() {
    return {
      provider: "groq",
      text: '{"schemaVersion":"v1","text":"ready","action":{"type":"none"}}',
      finishReason: "stop",
    };
  },
  async probeProviders(): Promise<ChatProviderHealth[]> {
    return [];
  },
};
const orchestrator: CatalogChatOrchestrator = createCatalogChatOrchestrator({
  retrievalService,
  chatManager,
});
const catalogChatInput: CatalogChatInput = {
  tenant: {
    companyId,
    preferredLanguage: language,
  },
  conversation: {
    conversationId: "conversation-1",
    recentTurns: [
      {
        role: "user",
        text: "مرحبا",
      },
    ],
    allowedActions: ["none", "clarify"],
  },
  userMessage: "مرحبا",
  requestId: "request-1",
};
const createCatalogChatPromise = (): Promise<CatalogChatResult> => orchestrator.respond(catalogChatInput);
const catalogChatResultPromise: Promise<CatalogChatResult> =
  undefined as unknown as ReturnType<typeof createCatalogChatPromise>;
const assistant: AssistantStructuredOutput = {
  schemaVersion: "v1",
  text: "ready",
  action: {
    type: "none",
  },
};

void request;
void response;
void adapter;
void companyId;
void language;
void detection;
void promptInput;
void prompt;
void retrievalService;
void chatManager;
void orchestrator;
void catalogChatInput;
void createCatalogChatPromise;
void catalogChatResultPromise;
void assistant;
