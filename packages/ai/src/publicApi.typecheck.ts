import {
  type AssistantActionType,
  type AssistantStructuredOutput,
  type CatalogGroundingBundle,
  type ChatCallOptions,
  type ChatLanguage,
  type ChatManagerCallOptions,
  type ChatProviderAdapter,
  type ChatProviderAttemptFailure,
  type ChatProviderProbeOptions,
  type ChatRequest,
  type ChatResponse,
  type DetectedChatLanguage,
  type GroundingContextBlock,
  type LanguageDetectionResult,
  type LanguageResolutionOptions,
  type ParseAssistantStructuredOutputOptions,
  type ParseAssistantStructuredOutputResult,
  type PromptAssemblyInput,
  type PromptAssemblyOutput,
  type PromptBehaviorInstructions,
  type PromptHistoryTurn,
  assemblePrompt,
  createChatProviderManager,
  detectChatLanguage,
  parseAssistantStructuredOutput,
  resolveChatResponseLanguage,
  StructuredOutputParseError,
} from './index';
import type { CanonicalConversationStateDto, ConversationSummaryDto } from '@cs/shared';

const request: ChatRequest = {
  messages: [
    {
      role: "user",
      content: "hello",
    },
  ],
};

const response: ChatResponse = {
  provider: "deepseek",
  text: "hello",
  finishReason: "stop",
};

const adapter: ChatProviderAdapter = {
  provider: "gemini",
  async chat(normalizedRequest, config) {
    return {
      provider: "gemini",
      model: config.model,
      text: normalizedRequest.messages[0]?.content[0]?.text ?? "",
      finishReason: "stop",
    };
  },
  async healthCheck(config) {
    return {
      provider: "gemini",
      ok: Boolean(config.apiKey),
      model: config.model,
    };
  },
};

const callOptions: ChatCallOptions = {
  timeoutMs: 2_000,
  maxRetries: 1,
};

const managerCallOptions: ChatManagerCallOptions = {
  timeoutMs: 2_000,
  maxRetriesPerProvider: 1,
  logContext: {
    companyId: "company-1",
  },
};

const probeOptions: ChatProviderProbeOptions = {
  providers: ["deepseek", "gemini"],
  timeoutMs: 2_000,
  maxRetries: 1,
};

const failure: ChatProviderAttemptFailure = {
  provider: "gemini",
  kind: "unavailable",
  disposition: "failover_provider",
  message: "provider unavailable",
};

const language: ChatLanguage = "ar";
const detectedLanguage: DetectedChatLanguage = "mixed";
const languageOptions: LanguageResolutionOptions = {
  preferredLanguage: "en",
};
const detectionResult: LanguageDetectionResult = detectChatLanguage("hello", languageOptions);
const responseLanguage = resolveChatResponseLanguage({
  classification: detectedLanguage,
  arabicCharCount: 1,
  englishCharCount: 2,
  preferredLanguage: language,
});
const actionType: AssistantActionType = "clarify";
const groundingContext: GroundingContextBlock[] = [
  {
    id: "product-1",
    heading: "Burger Box",
    body: "Sizes: S, M, L",
  },
];
const recentTurns: PromptHistoryTurn[] = [
  {
    role: "user",
    text: "hello",
  },
];
const summary: ConversationSummaryDto = {
  summaryId: "summary-1",
  conversationId: "conversation-1",
  durableCustomerGoal: "Find burger boxes",
  stablePreferences: ["English responses"],
  importantResolvedDecisions: [
    {
      summary: "Customer asked about burger boxes",
    },
  ],
  historicalContextNeededForFutureTurns: ["Customer is asking about packaging products"],
  freshness: {
    status: "fresh",
  },
  provenance: {
    source: "shadow",
  },
  coveredMessageRange: {
    messageCount: 2,
  },
};
const state: CanonicalConversationStateDto = {
  schemaVersion: "v1",
  conversationId: "conversation-1",
  companyId: "company-1",
  responseLanguage: "en",
  currentFocus: {
    kind: "product",
    entityIds: ["product-1"],
  },
  pendingClarification: {
    active: false,
  },
  freshness: {
    status: "fresh",
  },
  sourceOfTruthMarkers: {},
  heuristicHints: {
    usedQuotedReference: false,
    topCandidates: [],
  },
};
const behaviorInstructions: PromptBehaviorInstructions = {
  responseLanguage: "en",
  allowedActions: ["clarify"],
  groundingPolicy: "supplied_facts_only",
  ambiguityPolicy: "clarify_instead_of_guessing",
  handoffPolicy: "handoff_on_explicit_request_or_unsafe_help",
  offTopicPolicy: "refuse",
  stylePolicy: "concise_target_language",
  responseFormat: "assistant_structured_output_v1",
};
const groundingBundle: CatalogGroundingBundle = {
  bundleId: "bundle-1",
  retrievalMode: "raw_latest_message",
  resolvedQuery: "Need burger boxes",
  entityRefs: [
    {
      entityKind: "product",
      entityId: "product-1",
    },
  ],
  contextBlocks: groundingContext,
  language: "en",
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
const promptInput: PromptAssemblyInput = {
  behaviorInstructions,
  conversationSummary: summary,
  conversationState: state,
  recentTurns,
  groundingBundle,
  currentUserTurn: {
    text: "Need burger boxes",
  },
};
const builtPrompt: PromptAssemblyOutput = assemblePrompt(promptInput);
const structuredOutput: AssistantStructuredOutput = {
  schemaVersion: "v1",
  text: "Please clarify which size you need.",
  action: {
    type: actionType,
  },
};
const parseOptions: ParseAssistantStructuredOutputOptions = {
  allowedActions: ["clarify"],
};
const parsedStructuredOutput: ParseAssistantStructuredOutputResult = parseAssistantStructuredOutput(
  '{"schemaVersion":"v1","text":"Please clarify which size you need.","action":{"type":"clarify"}}',
  parseOptions,
);
const parseError: StructuredOutputParseError = parsedStructuredOutput.ok
  ? new StructuredOutputParseError("invalid_text", "invalid")
  : parsedStructuredOutput.error;

const manager = createChatProviderManager();

void request;
void response;
void adapter;
void callOptions;
void managerCallOptions;
void probeOptions;
void failure;
void language;
void detectedLanguage;
void languageOptions;
void detectionResult;
void responseLanguage;
void actionType;
void groundingContext;
void recentTurns;
void summary;
void state;
void behaviorInstructions;
void groundingBundle;
void promptInput;
void builtPrompt;
void structuredOutput;
void parseOptions;
void parsedStructuredOutput;
void parseError;
void manager;
