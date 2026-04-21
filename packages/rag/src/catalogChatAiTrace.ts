import type { GroundingContextBlock } from "@cs/ai";
import type { RetrievalRewriteTrace } from "./retrievalRewrite";

export interface CatalogChatAiTrace {
  event: "ai.retrieval_rewrite" | "ai.answer_generation";
  systemPrompt: string;
  groundingContext?: unknown;
  provider: string;
  usage?: unknown;
  apiResult: unknown;
}

export const toCatalogChatAiTrace = (
  trace: RetrievalRewriteTrace,
): CatalogChatAiTrace => ({
  event: "ai.retrieval_rewrite",
  systemPrompt: trace.systemPrompt,
  provider: trace.provider,
  usage: trace.usage,
  apiResult: trace.apiResult,
});

export const toAnswerGenerationAiTrace = (input: {
  systemPrompt: string;
  groundingContext: GroundingContextBlock[];
  provider: string;
  usage?: unknown;
  apiResult: string;
}): CatalogChatAiTrace => ({
  event: "ai.answer_generation",
  systemPrompt: input.systemPrompt,
  ...(input.groundingContext.length > 0
    ? { groundingContext: input.groundingContext }
    : {}),
  provider: input.provider,
  usage: input.usage,
  apiResult: input.apiResult,
});

export const withCatalogChatAiTraces = (
  aiTraces: CatalogChatAiTrace[],
): { aiTraces?: CatalogChatAiTrace[] } =>
  aiTraces.length > 0 ? { aiTraces } : {};
