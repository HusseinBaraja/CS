import {
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  jidDecode,
  jidNormalizedUser,
  normalizeMessageContent,
  type BaileysEventMap,
  type WAMessage,
} from '@whiskeysockets/baileys';
import {
  canonicalizePhoneNumber,
  type CompanyRuntimeProfile,
  type IgnoredInboundEvent,
  type IgnoredInboundEventReason,
  type InboundDispatch,
  type InboundRoute,
  type NormalizedInboundMessage,
} from '@cs/shared';

type MessagesUpsertEvent = BaileysEventMap["messages.upsert"];

const createIgnoredEvent = (
  profile: CompanyRuntimeProfile,
  upsertType: MessagesUpsertEvent["type"],
  reason: IgnoredInboundEventReason,
  message: Partial<Pick<WAMessage, "key">>,
): IgnoredInboundEvent => {
  const rawMessageId = typeof message.key?.id === "string" ? message.key.id : undefined;
  const remoteJid = typeof message.key?.remoteJid === "string"
    ? jidNormalizedUser(message.key.remoteJid)
    : undefined;

  return {
    transport: "whatsapp",
    companyId: profile.companyId,
    sessionKey: profile.sessionKey,
    reason,
    source: {
      upsertType,
      ...(rawMessageId !== undefined ? { rawMessageId } : {}),
      ...(remoteJid !== undefined ? { remoteJid } : {}),
      ...(message.key?.fromMe !== undefined && message.key?.fromMe !== null
        ? { fromMe: message.key.fromMe }
        : {}),
    },
  };
};

const normalizeText = (text: string | null | undefined): string =>
  typeof text === "string"
    ? text.replace(/\r\n?/g, "\n").trim()
    : "";

const normalizeDisplayName = (value: string | null | undefined): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : undefined;
};

const extractCanonicalPhoneNumber = (jid: string | null | undefined): string | null => {
  if (typeof jid !== "string" || jid.trim().length === 0) {
    return null;
  }

  const decodedUser = jidDecode(jid)?.user;
  const decodedPhoneNumber = canonicalizePhoneNumber(decodedUser ?? "");
  if (decodedPhoneNumber) {
    return decodedPhoneNumber;
  }

  const rawUser = jid.split("@", 1)[0] ?? "";
  const baseUser = rawUser.split(":", 1)[0] ?? rawUser;
  return canonicalizePhoneNumber(baseUser ?? "");
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const getReferencedMessageId = (normalizedContent: NonNullable<ReturnType<typeof normalizeMessageContent>>): string | undefined => {
  const candidates = [
    normalizedContent.extendedTextMessage?.contextInfo?.stanzaId,
    normalizedContent.imageMessage?.contextInfo?.stanzaId,
    normalizedContent.videoMessage?.contextInfo?.stanzaId,
    normalizedContent.audioMessage?.contextInfo?.stanzaId,
    normalizedContent.documentMessage?.contextInfo?.stanzaId,
    normalizedContent.stickerMessage?.contextInfo?.stanzaId,
  ];

  for (const candidate of candidates) {
    const normalized = readOptionalString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
};

const extractReferencedMessageId = (message: WAMessage): string | undefined => {
  const normalizedContent = normalizeMessageContent(message.message);
  if (!normalizedContent) {
    return undefined;
  }

  return getReferencedMessageId(normalizedContent);
};

const coerceTimestampToMs = (value: WAMessage["messageTimestamp"]): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  let numericValue: number;
  if (typeof value === "number") {
    numericValue = value;
  } else if (typeof value === "bigint") {
    numericValue = Number(value);
  } else if (typeof value === "string") {
    numericValue = Number(value);
  } else if (typeof value === "object" && "toString" in value) {
    numericValue = Number(value.toString());
  } else {
    return null;
  }

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue < 1_000_000_000_000 ? numericValue * 1_000 : numericValue;
};

const getContent = (
  message: WAMessage,
): Pick<NormalizedInboundMessage["content"], "kind" | "text"> | null | "empty_payload" => {
  const normalizedContent = normalizeMessageContent(message.message);
  if (!normalizedContent) {
    return "empty_payload";
  }

  const contentType = getContentType(normalizedContent);
  if (!contentType) {
    return "empty_payload";
  }

  switch (contentType) {
    case "conversation":
      return {
        kind: "text",
        text: normalizeText(normalizedContent.conversation),
      };
    case "extendedTextMessage":
      return {
        kind: "text",
        text: normalizeText(normalizedContent.extendedTextMessage?.text),
      };
    case "imageMessage":
      return {
        kind: "image",
        text: normalizeText(normalizedContent.imageMessage?.caption),
      };
    case "videoMessage":
      return {
        kind: "video",
        text: normalizeText(normalizedContent.videoMessage?.caption),
      };
    case "audioMessage":
      return {
        kind: "audio",
        text: "",
      };
    case "documentMessage":
      return {
        kind: "document",
        text: normalizeText(normalizedContent.documentMessage?.caption),
      };
    case "stickerMessage":
      return {
        kind: "sticker",
        text: "",
      };
    default:
      return null;
  }
};

const getRoute = (message: NormalizedInboundMessage): InboundRoute =>
  message.sender.role === "owner" &&
    message.content.kind === "text" &&
    message.content.text.trimStart().startsWith("!")
    ? "owner_command"
    : "customer_conversation";

export const normalizeInboundMessages = (
  profile: CompanyRuntimeProfile,
  event: MessagesUpsertEvent,
): InboundDispatch[] => event.messages.map((message) => {
  if (event.type === "append") {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "history_sync_append", message),
    } satisfies InboundDispatch;
  }

  if (message.key?.fromMe === true) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "from_me", message),
    } satisfies InboundDispatch;
  }

  if (!message.key?.id) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "missing_message_id", message),
    } satisfies InboundDispatch;
  }

  if (!message.key.remoteJid) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "missing_remote_jid", message),
    } satisfies InboundDispatch;
  }

  const remoteJid = jidNormalizedUser(message.key.remoteJid);
  if (isJidStatusBroadcast(remoteJid)) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "status_broadcast", message),
    } satisfies InboundDispatch;
  }

  if (isJidGroup(remoteJid)) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "group_chat", message),
    } satisfies InboundDispatch;
  }

  if (isJidNewsletter(remoteJid)) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "newsletter", message),
    } satisfies InboundDispatch;
  }

  if (isJidBroadcast(remoteJid)) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "broadcast", message),
    } satisfies InboundDispatch;
  }

  const senderJidCandidate =
    message.key.participantAlt ??
    message.key.participant ??
    message.key.remoteJidAlt ??
    message.key.remoteJid;
  const senderTransportId = jidNormalizedUser(senderJidCandidate ?? remoteJid);
  const conversationPhoneNumber =
    extractCanonicalPhoneNumber(message.key.remoteJidAlt) ??
    extractCanonicalPhoneNumber(message.key.remoteJid) ??
    extractCanonicalPhoneNumber(senderTransportId);
  const senderPhoneNumber =
    extractCanonicalPhoneNumber(message.key.participantAlt) ??
    extractCanonicalPhoneNumber(message.key.participant) ??
    conversationPhoneNumber;
  if (!senderPhoneNumber) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "missing_sender_phone", message),
    } satisfies InboundDispatch;
  }

  const occurredAtMs = coerceTimestampToMs(message.messageTimestamp);
  if (occurredAtMs === null) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "missing_timestamp", message),
    } satisfies InboundDispatch;
  }

  const content = getContent(message);
  if (content === "empty_payload") {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "empty_payload", message),
    } satisfies InboundDispatch;
  }

  if (content === null) {
    return {
      kind: "ignored",
      event: createIgnoredEvent(profile, event.type, "unsupported_message_type", message),
    } satisfies InboundDispatch;
  }

  const referencedMessageId = extractReferencedMessageId(message);

  const normalizedMessage: NormalizedInboundMessage = {
    transport: "whatsapp",
    companyId: profile.companyId,
    sessionKey: profile.sessionKey,
    messageId: message.key.id,
    occurredAtMs,
    conversationPhoneNumber: conversationPhoneNumber ?? senderPhoneNumber,
    sender: {
      phoneNumber: senderPhoneNumber,
      transportId: senderTransportId,
      role: canonicalizePhoneNumber(profile.ownerPhone) === senderPhoneNumber ? "owner" : "customer",
      ...(normalizeDisplayName(message.pushName) !== undefined
        ? { displayName: normalizeDisplayName(message.pushName) }
        : {}),
    },
    content: {
      kind: content.kind,
      text: content.text,
      hasMedia: content.kind !== "text",
    },
    source: {
      upsertType: event.type,
    },
    ...(referencedMessageId !== undefined
      ? {
          replyContext: {
            referencedMessageId,
          },
        }
      : {}),
  };

  return {
    kind: "dispatch",
    route: getRoute(normalizedMessage),
    message: normalizedMessage,
  } satisfies InboundDispatch;
});
