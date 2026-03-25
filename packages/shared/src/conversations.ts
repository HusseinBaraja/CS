export const CONVERSATION_STATE_EVENT_TYPES = [
  "handoff_started",
  "handoff_resumed_manual",
  "handoff_resumed_auto",
] as const;

export type ConversationStateEventType = (typeof CONVERSATION_STATE_EVENT_TYPES)[number];

export const CONVERSATION_STATE_EVENT_SOURCES = [
  "assistant_action",
  "provider_failure_fallback",
  "invalid_model_output_fallback",
  "api_manual",
  "worker_auto",
] as const;

export type ConversationStateEventSource = (typeof CONVERSATION_STATE_EVENT_SOURCES)[number];

export interface ConversationStateDto {
  id: string;
  companyId: string;
  phoneNumber: string;
  muted: boolean;
  mutedAt?: number;
  lastCustomerMessageAt?: number;
  nextAutoResumeAt?: number;
}

export interface ConversationMessageDto {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  transportMessageId?: string;
  referencedTransportMessageId?: string;
}
