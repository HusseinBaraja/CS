import type { ChatMessageRole, ChatRequest } from './contracts';
import type { ChatLanguage } from './language';
import type { CanonicalConversationStateDto, ConversationSummaryDto } from '@cs/shared';

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

export type PromptLayerType =
  | "behavior_instructions"
  | "conversation_summary"
  | "conversation_state"
  | "recent_turns"
  | "grounding_facts"
  | "current_user_turn";

export interface PromptLayerMetadata {
  layer: PromptLayerType;
  present: boolean;
  messageRole: ChatMessageRole;
  itemCount: number;
  charCount: number;
  truncated: boolean;
}

export interface PromptLayerOmission {
  layer: PromptLayerType;
  reason: "missing" | "empty";
}

export interface PromptLayerBudget {
  layer: PromptLayerType;
  maxTokens: number | null;
}

export interface GroundingEntityRef {
  entityKind: "category" | "product" | "variant" | "offer";
  entityId: string;
}

export interface CatalogGroundingCategory {
  id: string;
  name: string;
}

export interface CatalogGroundingProduct {
  id: string;
  name: string;
}

export interface CatalogGroundingVariant {
  id: string;
  productId: string;
  label: string;
}

export interface CatalogGroundingOffer {
  id: string;
  title: string;
}

export interface CatalogGroundingPricingFact {
  entityId: string;
  kind: "base_price" | "price_override" | "display_price";
  value: number;
  currency?: string;
}

export interface CatalogGroundingImageAvailability {
  entityId: string;
  hasImages: boolean;
  imageCount?: number;
}

export interface CatalogGroundingOmission {
  kind:
    | "categories"
    | "products"
    | "variants"
    | "offers"
    | "pricing_facts"
    | "image_availability";
  reason: "not_collected" | "not_available";
}

export type PromptAssemblyRetrievalMode =
  | "raw_latest_message"
  | "direct_entity_lookup"
  | "variant_lookup"
  | "filtered_catalog_search"
  | "semantic_catalog_search";

export interface CatalogGroundingBundle {
  bundleId: string;
  retrievalMode: PromptAssemblyRetrievalMode;
  resolvedQuery: string;
  entityRefs: GroundingEntityRef[];
  contextBlocks: GroundingContextBlock[];
  language: ChatLanguage;
  retrievalConfidence: number | null;
  products: CatalogGroundingProduct[];
  categories: CatalogGroundingCategory[];
  variants: CatalogGroundingVariant[];
  offers: CatalogGroundingOffer[];
  pricingFacts: CatalogGroundingPricingFact[];
  imageAvailability: CatalogGroundingImageAvailability[];
  omissions: CatalogGroundingOmission[];
}

export interface PromptBehaviorInstructions {
  responseLanguage: ChatLanguage;
  allowedActions?: readonly AssistantActionType[];
  groundingPolicy: "supplied_facts_only";
  ambiguityPolicy: "clarify_instead_of_guessing";
  handoffPolicy: "handoff_on_explicit_request_or_unsafe_help";
  offTopicPolicy: "refuse";
  stylePolicy: "concise_target_language";
  responseFormat: "assistant_structured_output_v1";
}

export interface PromptAssemblyInput {
  behaviorInstructions: PromptBehaviorInstructions;
  conversationSummary: ConversationSummaryDto | null;
  conversationState: CanonicalConversationStateDto | null;
  recentTurns: PromptHistoryTurn[];
  groundingBundle: CatalogGroundingBundle | null;
  currentUserTurn: {
    text: string;
  };
}

export interface PromptAssemblyOutput {
  messages: ChatRequest["messages"];
  layerMetadata: PromptLayerMetadata[];
  tokenBudgetByLayer: Record<PromptLayerType, PromptLayerBudget>;
  omittedContext: PromptLayerOmission[];
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
