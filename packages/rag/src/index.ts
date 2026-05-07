import {
  type AssistantActionType,
  type AssistantStructuredOutput,
  type ChatLanguage,
  type ChatProviderManager,
  type ChatResponse,
  buildGroundedChatPrompt,
  createChatProviderManager,
  detectChatLanguage,
  getAllowedActions,
  type LanguageDetectionResult,
  parseAssistantStructuredOutput,
  type PromptHistoryTurn,
} from '@cs/ai';
import type { CatalogLanguageHints } from '@cs/shared';
import {
  logEvent,
  serializeErrorForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import {
  type Id,
} from '@cs/db';
import {
  buildRetrievalQueryPlan,
  buildRetrievalRewriteInput,
  createRetrievalRewriteService,
  mergeRetrievalResults,
  type CatalogChatConversationHistorySelection,
  type RetrievalMode,
  type RetrievalRewriteAttempt,
  type RetrievalRewriteService,
} from './retrievalRewrite';
import {
  createProductRetrievalService,
  type ProductRetrievalService,
  type RetrieveCatalogContextResult,
  type RetrievalReason,
} from './catalogRetrieval';
import {
  type CatalogLanguageHintsService,
  createCatalogLanguageHintsService,
} from './catalogLanguageHints';
import {
  createCompanySettingsService,
  type CompanySettingsService,
  type MissingPricePolicy,
} from './companySettings';
import { summarizePromptRetrievalProvenance } from './retrievalProvenance';
import {
  buildRetrievalLogContext,
  buildRewriteLogContext,
  summarizePrimaryRetrievalQueryForLog,
  summarizeProviderTextForLog,
  summarizeQueryForLog,
} from "./catalogChatLogging";
import {
  toAnswerGenerationAiTrace,
  toCatalogChatAiTrace,
  withCatalogChatAiTraces,
  type CatalogChatAiTrace,
} from "./catalogChatAiTrace";
export {
  buildRetrievalQueryText,
  createProductRetrievalService,
  generateRetrievalQueryEmbedding,
} from './catalogRetrieval';
export type {
  GenerateRetrievalQueryEmbeddingInput,
  GenerateRetrievalQueryEmbeddingOptions,
  ProductRetrievalService,
  ProductRetrievalServiceOptions,
  RetrieveCatalogContextInput,
  RetrieveCatalogContextResult,
  RetrievedProductCandidate,
  RetrievedProductContext,
  RetrievalReason,
  RetrievalOutcome,
} from './catalogRetrieval';
export {
  buildQuotedMessageCombinedFallbackQuery,
  buildRetrievalQueryPlan,
  buildRetrievalRewriteInput,
  createRetrievalRewriteService,
  mergeRetrievalResults,
  parseRetrievalRewriteResult,
  RETRIEVAL_REWRITE_RESULT_JSON_SCHEMA,
  type CatalogChatConversationHistorySelection,
  type MergedRetrievalCandidate,
  type MergedRetrievalResult,
  type MergeableRetrievedCandidate,
  type MergeableRetrievalResult,
  type RetrievalHistorySelectionReason,
  type RetrievalMode,
  type RetrievalPlannedQuery,
  type RetrievalQueryPlan,
  type RetrievalQueryProvenance,
  type RetrievalQuerySource,
  type RetrievalRewriteAttempt,
  type RetrievalRewriteConfidence,
  type RetrievalRewriteFailureReason,
  type RetrievalRewriteInput,
  type RetrievalRewriteResult,
  type RetrievalRewriteService,
  type RetrievalRewriteStrategy,
  type RetrievalRewriteTrace,
  type RetrievalRewriteUnresolvedReason,
} from './retrievalRewrite';
export {
  createCatalogLanguageHintsService,
} from './catalogLanguageHints';
export {
  createCompanySettingsService,
} from './companySettings';
export {
  summarizePromptRetrievalProvenance,
} from './retrievalProvenance';
export type {
  CatalogChatAiTrace,
} from "./catalogChatAiTrace";
export type {
  PromptRetrievalProvenanceCandidate,
} from './retrievalProvenance';
export type {
  CatalogLanguageHintsService,
} from './catalogLanguageHints';
export type {
  CompanySettingsService,
  MissingPricePolicy,
} from './companySettings';

const DEFAULT_MAX_CONTEXT_BLOCKS = 3;

export type { ChatLanguage, GroundingContextBlock } from '@cs/ai';
export type { CatalogLanguageHints } from '@cs/shared';
export type {
  AssistantActionType,
  AssistantStructuredOutput,
  LanguageDetectionResult,
  PromptHistoryTurn,
} from '@cs/ai';

export interface CatalogChatTenantContext {
  companyId: Id<"companies">;
  preferredLanguage?: ChatLanguage;
  defaultLanguage?: ChatLanguage;
}

export interface CatalogChatConversationContext {
  conversationId?: string;
  history?: PromptHistoryTurn[];
  historySelection?: CatalogChatConversationHistorySelection;
  allowedActions?: readonly AssistantActionType[];
}

export interface CatalogChatInput {
  tenant: CatalogChatTenantContext;
  conversation?: CatalogChatConversationContext;
  userMessage: string;
  requestId?: string;
  logger?: StructuredLogger;
  signal?: AbortSignal;
  retrieval?: {
    maxResults?: number;
    maxContextBlocks?: number;
    minScore?: number;
  };
  provider?: {
    timeoutMs?: number;
    maxRetriesPerProvider?: number;
  };
}

export type CatalogChatOutcome =
  | "provider_response"
  | "empty_query_fallback"
  | "no_hits_fallback"
  | "low_signal_fallback"
  | "missing_price_fallback"
  | "provider_failure_fallback"
  | "invalid_model_output_fallback";

export interface CatalogChatResult {
  outcome: CatalogChatOutcome;
  assistant: AssistantStructuredOutput;
  language: LanguageDetectionResult;
  retrieval: RetrieveCatalogContextResult;
  retrievalMode: RetrievalMode;
  rewrite?: RetrievalRewriteAttempt;
  aiTraces?: CatalogChatAiTrace[];
  provider?: Pick<ChatResponse, "provider" | "model" | "finishReason" | "usage" | "responseId">;
}

export interface CatalogChatOrchestrator {
  respond(input: CatalogChatInput): Promise<CatalogChatResult>;
}

export type CatalogChatLogger = StructuredLogger;

export interface CreateCatalogChatOrchestratorOptions {
  retrievalService?: ProductRetrievalService;
  rewriteService?: RetrievalRewriteService;
  catalogLanguageHintsService?: CatalogLanguageHintsService;
  companySettingsService?: CompanySettingsService;
  chatManager?: ChatProviderManager;
  detectLanguage?: typeof detectChatLanguage;
  buildPrompt?: typeof buildGroundedChatPrompt;
  parseStructuredOutput?: typeof parseAssistantStructuredOutput;
  logger?: CatalogChatLogger;
}

const normalizeNonNegativeInteger = (value: number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
};

const pickProviderMetadata = (
  response: ChatResponse,
): Pick<ChatResponse, "provider" | "model" | "finishReason" | "usage" | "responseId"> => ({
  provider: response.provider,
  model: response.model,
  finishReason: response.finishReason,
  usage: response.usage,
  responseId: response.responseId,
});

const buildAssistantFallback = (
  responseLanguage: ChatLanguage,
  type: "empty_query" | "no_hits" | "low_signal" | "missing_price_unavailable" | "handoff",
): AssistantStructuredOutput => {
  switch (type) {
    case "empty_query":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "ما المنتج الذي تريد أن أساعِدك به؟",
          action: { type: "clarify" },
        }
        : {
          schemaVersion: "v1",
          text: "Which product can I help you with?",
          action: { type: "clarify" },
        };
    case "no_hits":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "لم أجد منتجًا مطابقًا في الكتالوج الحالي.",
          action: { type: "none" },
        }
        : {
          schemaVersion: "v1",
          text: "I couldn't find a matching product in the current catalog.",
          action: { type: "none" },
        };
    case "low_signal":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "لم أتمكن من مطابقة طلبك بثقة مع الكتالوج الحالي.",
          action: { type: "none" },
        }
        : {
          schemaVersion: "v1",
          text: "I couldn't confidently match your request to the current catalog.",
          action: { type: "none" },
        };
    case "missing_price_unavailable":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "السعر غير متوفر في الكتالوج الحالي.",
          action: { type: "none" },
        }
        : {
          schemaVersion: "v1",
          text: "The price is not available in the current catalog.",
          action: { type: "none" },
        };
    case "handoff":
      return responseLanguage === "ar"
        ? {
          schemaVersion: "v1",
          text: "لا أستطيع المساعدة بأمان الآن، لذا سأحوّلك إلى الفريق.",
          action: { type: "handoff" },
        }
        : {
          schemaVersion: "v1",
          text: "I can't help safely right now, so I'll connect you with the team.",
          action: { type: "handoff" },
        };
  }
};

const PRICE_INTENT_PATTERN =
  /(\b(price|cost|how much|rate|pricing)\b|بكم|كم السعر|السعر|سعر|تكلفة|كم يكلف)/i;

const hasPriceIntent = (message: string): boolean => PRICE_INTENT_PATTERN.test(message);

const retrievalHasAnyPrice = (retrieval: RetrieveCatalogContextResult): boolean =>
  retrieval.candidates.some((candidate) =>
    candidate.product.price !== undefined ||
    candidate.product.variants.some((variant) => variant.price !== undefined)
  );

const defaultCatalogChatLogger: CatalogChatLogger = {
  debug() {
    return undefined;
  },
  info() {
    return undefined;
  },
  warn() {
    return undefined;
  },
  error() {
    return undefined;
  },
};

const safeLogEvent = (
  logger: CatalogChatLogger,
  level: "info" | "warn" | "error",
  payload: {
    event: string;
    runtime: string;
    surface: string;
    outcome: string;
  } & Record<string, unknown>,
  message: string,
): void => {
  try {
    logEvent(logger, level, payload, message);
  } catch {
    // Logging must never interfere with catalog chat fallbacks.
  }
};

export const createCatalogChatOrchestrator = (
  options: CreateCatalogChatOrchestratorOptions = {},
): CatalogChatOrchestrator => {
  const retrievalService = options.retrievalService ?? createProductRetrievalService();
  const chatManager = options.chatManager ?? createChatProviderManager();
  const rewriteService = options.rewriteService ?? createRetrievalRewriteService();
  const catalogLanguageHintsService = options.catalogLanguageHintsService ?? createCatalogLanguageHintsService();
  const companySettingsService = options.companySettingsService ?? createCompanySettingsService();
  const detectLanguage = options.detectLanguage ?? detectChatLanguage;
  const buildPrompt = options.buildPrompt ?? buildGroundedChatPrompt;
  const parseStructuredOutput = options.parseStructuredOutput ?? parseAssistantStructuredOutput;
  const logger = options.logger ?? defaultCatalogChatLogger;

  return {
    async respond(input: CatalogChatInput): Promise<CatalogChatResult> {
      const routeLogger = withLogBindings(input.logger ?? logger, {
        runtime: "rag",
        surface: "orchestrator",
        companyId: input.tenant.companyId,
        ...(input.conversation?.conversationId
          ? { conversationId: input.conversation.conversationId }
          : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
      });
      const aiTraces: CatalogChatAiTrace[] = [];
      const retrievalLogger = withLogBindings(routeLogger, {
        surface: "retrieval",
      });
      const language = detectLanguage(input.userMessage, {
        preferredLanguage: input.tenant.preferredLanguage,
        defaultLanguage: input.tenant.defaultLanguage,
      });
      if (input.userMessage.trim().length === 0) {
        const rewrite: RetrievalRewriteAttempt | undefined = undefined;
        const retrieval: RetrieveCatalogContextResult = {
          outcome: "empty",
          reason: "empty_query",
          query: "",
          language: language.responseLanguage,
          candidates: [],
          contextBlocks: [],
          retrievalMode: "rewrite_degraded",
        };

        safeLogEvent(
          retrievalLogger,
          "info",
          {
            event: "rag.retrieval.completed",
            runtime: "rag",
            surface: "retrieval",
            outcome: retrieval.outcome,
            responseLanguage: language.responseLanguage,
            historySelectionReason: "empty",
            rewrite: buildRewriteLogContext(rewrite),
            queryCount: 1,
            retrieval: buildRetrievalLogContext(retrieval),
            ...summarizeQueryForLog(input.userMessage),
            ...summarizePrimaryRetrievalQueryForLog(""),
          },
          "catalog retrieval completed",
        );
        safeLogEvent(
          routeLogger,
          "info",
          {
            event: "rag.catalog_chat.completed",
            runtime: "rag",
            surface: "orchestrator",
            outcome: "empty_query_fallback",
            responseLanguage: language.responseLanguage,
            finalResponseBranch: "empty_query_fallback",
            rewrite: buildRewriteLogContext(rewrite),
            retrieval: buildRetrievalLogContext(retrieval),
          },
          "catalog chat response completed",
        );

        return {
          outcome: "empty_query_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "empty_query"),
          language,
          retrieval,
          retrievalMode: "rewrite_degraded",
          ...withCatalogChatAiTraces(aiTraces),
          ...(rewrite ? { rewrite } : {}),
        };
      }
      let catalogLanguageHints: CatalogLanguageHints | null = null;
      try {
        catalogLanguageHints = await catalogLanguageHintsService.getHints(input.tenant.companyId);
      } catch {
        catalogLanguageHints = null;
      }
      const allowedActions = getAllowedActions(input.conversation?.allowedActions);
      const rewriteInput = buildRetrievalRewriteInput({
        userMessage: input.userMessage,
        conversation: input.conversation,
        responseLanguageHint: language.responseLanguage,
        ...(catalogLanguageHints ? { catalogLanguageHints } : {}),
      });
      let rewrite: RetrievalRewriteAttempt;
      try {
        rewrite = await rewriteService.rewrite(rewriteInput, {
          signal: input.signal,
          timeoutMs: input.provider?.timeoutMs,
          maxRetriesPerProvider: input.provider?.maxRetriesPerProvider,
          logger: input.logger ?? logger,
          logContext: {
            companyId: input.tenant.companyId,
            ...(input.conversation?.conversationId
              ? { conversationId: input.conversation.conversationId }
              : {}),
            ...(input.requestId ? { requestId: input.requestId } : {}),
            feature: "catalog_retrieval_rewrite",
          },
        });
      } catch {
        rewrite = {
          status: "failure",
          failureReason: "provider_error",
        };
      }
      if (rewrite.trace) {
        aiTraces.push(toCatalogChatAiTrace(rewrite.trace));
      }
      const queryPlan = buildRetrievalQueryPlan({
        userMessage: input.userMessage,
        quotedMessage: rewriteInput.quotedMessage,
        rewriteAttempt: rewrite,
      });
      const maxContextBlocks = normalizeNonNegativeInteger(
        input.retrieval?.maxContextBlocks,
        DEFAULT_MAX_CONTEXT_BLOCKS,
      );
      const settledRetrievalResults = await Promise.allSettled(
        queryPlan.queries.map((queryPlanEntry) =>
          retrievalService.retrieveCatalogContext({
            companyId: input.tenant.companyId,
            query: queryPlanEntry.text,
            language: language.responseLanguage,
            maxResults: input.retrieval?.maxResults,
            maxContextBlocks: maxContextBlocks,
            minScore: input.retrieval?.minScore,
          })
        ),
      );
      const retrievalResults = settledRetrievalResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      if (retrievalResults.length === 0) {
        const rejectedResult = settledRetrievalResults.find((result) => result.status === "rejected");
        throw rejectedResult?.reason ?? new Error("All retrieval queries failed");
      }
      const mergedRetrieval = mergeRetrievalResults({
        queryPlan,
        retrievals: retrievalResults,
        maxContextBlocks,
      });
      const { reason: mergedReason, ...mergedRetrievalWithoutReason } = mergedRetrieval;
      const retrieval: RetrieveCatalogContextResult = {
        ...mergedRetrievalWithoutReason,
        ...(mergedReason
          ? { reason: mergedReason as RetrievalReason }
          : {}),
        retrievalMode: queryPlan.mode,
      };
      safeLogEvent(
        retrievalLogger,
        "info",
        {
          event: "rag.retrieval.completed",
          runtime: "rag",
          surface: "retrieval",
          outcome: retrieval.outcome,
          responseLanguage: language.responseLanguage,
          historySelectionReason: rewriteInput.historySelectionReason,
          rewrite: buildRewriteLogContext(rewrite),
          queryCount: queryPlan.queries.length,
          retrieval: buildRetrievalLogContext(retrieval),
          ...summarizeQueryForLog(input.userMessage),
          ...summarizePrimaryRetrievalQueryForLog(queryPlan.primaryQuery),
        },
        "catalog retrieval completed",
      );

      const logCatalogChatCompletion = (outcome: CatalogChatOutcome): void => {
        safeLogEvent(
          routeLogger,
          "info",
          {
            event: "rag.catalog_chat.completed",
            runtime: "rag",
            surface: "orchestrator",
            outcome,
            responseLanguage: language.responseLanguage,
            finalResponseBranch: outcome,
            rewrite: buildRewriteLogContext(rewrite),
            retrieval: buildRetrievalLogContext(retrieval),
          },
          "catalog chat response completed",
        );
      };

      if (retrieval.outcome === "empty") {
        const assistant = buildAssistantFallback(
          language.responseLanguage,
          retrieval.reason === "empty_query" ? "empty_query" : "no_hits",
        );
        const outcome = retrieval.reason === "empty_query" ? "empty_query_fallback" : "no_hits_fallback";
        logCatalogChatCompletion(outcome);

        return {
          outcome,
          assistant,
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          ...withCatalogChatAiTraces(aiTraces),
          rewrite,
        };
      }

      if (retrieval.outcome === "low_signal") {
        logCatalogChatCompletion("low_signal_fallback");
        return {
          outcome: "low_signal_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "low_signal"),
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          ...withCatalogChatAiTraces(aiTraces),
          rewrite,
        };
      }

      if (hasPriceIntent(input.userMessage) && !retrievalHasAnyPrice(retrieval)) {
        let missingPricePolicy: MissingPricePolicy = "reply_unavailable";
        try {
          missingPricePolicy = (await companySettingsService.getSettings(input.tenant.companyId)).missingPricePolicy;
        } catch {
          missingPricePolicy = "reply_unavailable";
        }

        logCatalogChatCompletion("missing_price_fallback");
        return {
          outcome: "missing_price_fallback",
          assistant: buildAssistantFallback(
            language.responseLanguage,
            missingPricePolicy === "handoff" ? "handoff" : "missing_price_unavailable",
          ),
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          ...withCatalogChatAiTraces(aiTraces),
          rewrite,
        };
      }

      const prompt = buildPrompt({
        responseLanguage: language.responseLanguage,
        customerMessage: input.userMessage,
        conversationHistory: input.conversation?.history,
        groundingContext: retrieval.contextBlocks,
        retrievalProvenance: summarizePromptRetrievalProvenance({
          mode: queryPlan.mode,
          candidates: retrieval.candidates,
          promptCandidateCount: retrieval.contextBlocks.length,
        }),
        allowedActions,
      });

      let providerResponse: ChatResponse;
      try {
        providerResponse = await chatManager.chat(prompt.request, {
          signal: input.signal,
          timeoutMs: input.provider?.timeoutMs,
          maxRetriesPerProvider: input.provider?.maxRetriesPerProvider,
          logger: input.logger ?? logger,
          logContext: {
            companyId: input.tenant.companyId,
            ...(input.conversation?.conversationId
              ? { conversationId: input.conversation.conversationId }
              : {}),
            ...(input.requestId ? { requestId: input.requestId } : {}),
            feature: "catalog_chat",
          },
        });
      } catch (error) {
        safeLogEvent(
          routeLogger,
          "error",
          {
            event: "rag.catalog_chat.provider_fallback",
            runtime: "rag",
            surface: "orchestrator",
            outcome: "provider_failure_fallback",
            companyId: input.tenant.companyId,
            ...(input.conversation?.conversationId
              ? { conversationId: input.conversation.conversationId }
              : {}),
            ...(input.requestId ? { requestId: input.requestId } : {}),
            responseLanguage: language.responseLanguage,
            rewrite: buildRewriteLogContext(rewrite),
            retrieval: buildRetrievalLogContext(retrieval),
            error: serializeErrorForLog(error),
          },
          "catalog chat provider fallback selected",
        );
        logCatalogChatCompletion("provider_failure_fallback");
        return {
          outcome: "provider_failure_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "handoff"),
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          ...withCatalogChatAiTraces(aiTraces),
          rewrite,
        };
      }
      aiTraces.push(toAnswerGenerationAiTrace({
        systemPrompt: prompt.systemPrompt,
        groundingContext: retrieval.contextBlocks,
        provider: providerResponse.provider,
        usage: providerResponse.usage,
        apiResult: providerResponse.text,
      }));

      try {
        const assistant = parseStructuredOutput(providerResponse.text, {
          allowedActions,
        });
        logCatalogChatCompletion("provider_response");

        return {
          outcome: "provider_response",
          assistant,
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          ...withCatalogChatAiTraces(aiTraces),
          rewrite,
          provider: pickProviderMetadata(providerResponse),
        };
      } catch (error) {
        safeLogEvent(
          routeLogger,
          "error",
          {
            event: "rag.catalog_chat.parse_failed",
            runtime: "rag",
            surface: "orchestrator",
            outcome: "invalid_model_output_fallback",
            companyId: input.tenant.companyId,
            ...(input.conversation?.conversationId
              ? { conversationId: input.conversation.conversationId }
              : {}),
            ...(input.requestId ? { requestId: input.requestId } : {}),
            responseLanguage: language.responseLanguage,
            rewrite: buildRewriteLogContext(rewrite),
            retrieval: buildRetrievalLogContext(retrieval),
            provider: pickProviderMetadata(providerResponse),
            ...summarizeProviderTextForLog(providerResponse.text),
            error: serializeErrorForLog(error),
          },
          "catalog chat structured output parsing failed",
        );
        logCatalogChatCompletion("invalid_model_output_fallback");
        return {
          outcome: "invalid_model_output_fallback",
          assistant: buildAssistantFallback(language.responseLanguage, "handoff"),
          language,
          retrieval,
          retrievalMode: queryPlan.mode,
          ...withCatalogChatAiTraces(aiTraces),
          rewrite,
          provider: pickProviderMetadata(providerResponse),
        };
      }
    },
  };
};
