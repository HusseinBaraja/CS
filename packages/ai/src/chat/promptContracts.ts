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

export type StructuredOutputParseFailureKind =
  | "invalid_json"
  | "invalid_payload_shape"
  | "invalid_schema_version"
  | "invalid_text"
  | "invalid_action";

export type ParseAssistantStructuredOutputResult =
  | {
    ok: true;
    value: AssistantStructuredOutput;
  }
  | {
    ok: false;
    error: StructuredOutputParseError;
  };

export interface GroundingContextBlock {
  id: string;
  heading: string;
  body: string;
}

export interface PromptHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface BuildGroundedChatPromptInput {
  responseLanguage: ChatLanguage;
  customerMessage: string;
  conversationHistory?: PromptHistoryTurn[];
  groundingContext?: GroundingContextBlock[];
  allowedActions?: readonly AssistantActionType[];
}

export interface BuiltGroundedChatPrompt {
  systemPrompt: string;
  userPrompt: string;
  request: ChatRequest;
}

export class StructuredOutputParseError extends Error {
  readonly kind: StructuredOutputParseFailureKind;

  constructor(
    kind: StructuredOutputParseFailureKind,
    message: string,
    options: {
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "StructuredOutputParseError";
    this.kind = kind;
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true,
      });
    }
  }
}
