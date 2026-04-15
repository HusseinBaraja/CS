import type { ChatRequest } from './contracts';
import type { ChatLanguage } from './language';

export type AssistantActionType = "none" | "clarify" | "handoff";

export interface AssistantStructuredOutput {
  schemaVersion: "v1";
  text: string;
  action: {
    type: AssistantActionType;
  };
}

export interface ParseAssistantStructuredOutputOptions {
  allowedActions?: readonly AssistantActionType[];
}

export interface GroundingContextBlock {
  id: string;
  heading: string;
  body: string;
}

export type PromptRetrievalMode = "primary_rewrite" | "rewrite_degraded";
export type PromptRetrievalQuerySource =
  | "resolved_query"
  | "search_alias"
  | "original_message_fallback"
  | "quoted_message_fallback";

export interface PromptRetrievalProvenance {
  mode: PromptRetrievalMode;
  primarySource: PromptRetrievalQuerySource;
  supportingSources: PromptRetrievalQuerySource[];
  usedAliasCount: number;
  convergedOnSharedProducts: boolean;
}

export interface PromptHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export type BuildGroundedChatPromptInput = {
  responseLanguage: ChatLanguage;
  customerMessage: string;
  conversationHistory?: PromptHistoryTurn[];
  groundingContext?: GroundingContextBlock[];
  allowedActions?: readonly AssistantActionType[];
} & (
  | {
    retrievalMode?: PromptRetrievalMode;
    retrievalProvenance?: undefined;
  }
  | {
    retrievalMode?: never;
    retrievalProvenance: PromptRetrievalProvenance;
  }
);

export interface BuiltGroundedChatPrompt {
  systemPrompt: string;
  userPrompt: string;
  request: ChatRequest;
}
