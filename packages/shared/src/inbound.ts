export const INBOUND_ROUTES = [
  "owner_command",
  "customer_conversation",
] as const;

export type InboundRoute = (typeof INBOUND_ROUTES)[number];

export const IGNORED_INBOUND_EVENT_REASONS = [
  "from_me",
  "history_sync_append",
  "group_chat",
  "broadcast",
  "status_broadcast",
  "newsletter",
  "missing_message_id",
  "missing_remote_jid",
  "missing_sender_phone",
  "missing_timestamp",
  "unsupported_message_type",
  "empty_payload",
] as const;

export type IgnoredInboundEventReason = (typeof IGNORED_INBOUND_EVENT_REASONS)[number];

export const INBOUND_MESSAGE_CONTENT_KINDS = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
] as const;

export type InboundMessageContentKind = (typeof INBOUND_MESSAGE_CONTENT_KINDS)[number];

export interface NormalizedInboundMessage {
  transport: "whatsapp";
  companyId: string;
  sessionKey: string;
  messageId: string;
  occurredAtMs: number;
  conversationPhoneNumber: string;
  sender: {
    phoneNumber: string;
    transportId: string;
    role: "owner" | "customer";
    displayName?: string;
  };
  content: {
    kind: InboundMessageContentKind;
    text: string;
    hasMedia: boolean;
  };
  source: {
    upsertType: "notify" | "append";
  };
}

export interface IgnoredInboundEvent {
  transport: "whatsapp";
  companyId: string;
  sessionKey: string;
  reason: IgnoredInboundEventReason;
  source: {
    upsertType: "notify" | "append";
    rawMessageId?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
}

export type InboundDispatch =
  | {
    kind: "dispatch";
    route: InboundRoute;
    message: NormalizedInboundMessage;
  }
  | {
    kind: "ignored";
    event: IgnoredInboundEvent;
  };

export const canonicalizePhoneNumber = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.replace(/[^\d]/g, "");
  return normalized.length > 0 ? normalized : null;
};
