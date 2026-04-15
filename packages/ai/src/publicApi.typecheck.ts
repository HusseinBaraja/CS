import {
  type AssistantActionType,
  type AssistantStructuredOutput,
  type BuildGroundedChatPromptInput,
  type BuiltGroundedChatPrompt,
  type ChatCallOptions,
  type ChatLanguage,
  type ChatManagerCallOptions,
  type ChatProviderAdapter,
  type ChatProviderAttemptFailure,
  type ChatProviderProbeOptions,
  type ChatResponseFormat,
  type CreateRetrievalRewriteChatProviderManagerOptions,
  type ChatRequest,
  type ChatResponse,
  type DetectedChatLanguage,
  type GroundingContextBlock,
  type LanguageDetectionResult,
  type LanguageResolutionOptions,
  type ParseAssistantStructuredOutputOptions,
  type PromptRetrievalMode,
  type PromptHistoryTurn,
  buildGroundedChatPrompt,
  createChatProviderManager,
  createRetrievalRewriteChatProviderManager,
  createRetrievalRewriteRuntimeConfig,
  detectChatLanguage,
  parseAssistantStructuredOutput,
  resolveChatResponseLanguage,
} from './index';

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
const responseFormat: ChatResponseFormat = {
  type: "json_schema",
  jsonSchema: {
    name: "rewrite_result",
    schema: {
      type: "object",
    },
    strict: true,
  },
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
const conversationHistory: PromptHistoryTurn[] = [
  {
    role: "user",
    text: "hello",
  },
];
const retrievalMode: PromptRetrievalMode = "primary_rewrite";
const promptInput: BuildGroundedChatPromptInput = {
  responseLanguage: "en",
  customerMessage: "Need burger boxes",
  groundingContext,
  conversationHistory,
  retrievalProvenance: {
    mode: retrievalMode,
    primarySource: "resolved_query",
    supportingSources: [],
    usedAliasCount: 0,
    convergedOnSharedProducts: false,
  },
};
// @ts-expect-error retrievalMode must not disagree with retrievalProvenance mode.
const contradictoryPromptInput: BuildGroundedChatPromptInput = { responseLanguage: "en", customerMessage: "Need burger boxes", retrievalMode: "primary_rewrite" as const, retrievalProvenance: { mode: "rewrite_degraded" as const, primarySource: "original_message_fallback" as const, supportingSources: [], usedAliasCount: 0, convergedOnSharedProducts: false } };
const builtPrompt: BuiltGroundedChatPrompt = buildGroundedChatPrompt(promptInput);
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
const parsedStructuredOutput: AssistantStructuredOutput = parseAssistantStructuredOutput(
  '{"schemaVersion":"v1","text":"Please clarify which size you need.","action":{"type":"clarify"}}',
  parseOptions,
);

const rewriteRuntimeConfig = createRetrievalRewriteRuntimeConfig();
const rewriteManagerOptions: CreateRetrievalRewriteChatProviderManagerOptions = {
  runtimeConfig: rewriteRuntimeConfig,
};
const manager = createChatProviderManager();
const rewriteManager = createRetrievalRewriteChatProviderManager(rewriteManagerOptions);

void request;
void response;
void responseFormat;
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
void conversationHistory;
void retrievalMode;
void promptInput;
void contradictoryPromptInput;
void builtPrompt;
void structuredOutput;
void parseOptions;
void parsedStructuredOutput;
void rewriteRuntimeConfig;
void rewriteManagerOptions;
void manager;
void rewriteManager;
