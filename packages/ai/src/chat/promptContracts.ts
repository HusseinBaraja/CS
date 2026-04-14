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

export interface PromptHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface BuildGroundedChatPromptInput {
  responseLanguage: ChatLanguage;
  customerMessage: string;
  conversationHistory?: PromptHistoryTurn[];
  groundingContext?: GroundingContextBlock[];
  retrievalMode?: PromptRetrievalMode;
  allowedActions?: readonly AssistantActionType[];
}

export interface BuiltGroundedChatPrompt {
  systemPrompt: string;
  userPrompt: string;
  request: ChatRequest;
}
