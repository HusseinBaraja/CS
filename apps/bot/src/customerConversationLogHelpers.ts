import {
  type ConversationSessionLogEntry,
  type ConversationSessionLogWriter,
  summarizeTextForLog,
} from "@cs/core";
import {
  getAnalyticsIdempotencyKey,
  isSamePhoneNumber,
  type NormalizedInboundMessage,
} from "@cs/shared";

export { getAnalyticsIdempotencyKey };

export const summarizeAssistantText = (value: string) => {
  const summary = summarizeTextForLog(value);

  return {
    assistantTextLength: summary.textLength,
    assistantTextLineCount: summary.textLineCount,
  };
};

export const summarizeUserText = (value: string) => {
  const summary = summarizeTextForLog(value);

  return {
    userTextLength: summary.textLength,
    userTextLineCount: summary.textLineCount,
  };
};

export const serializeInboundMessage = (message: NormalizedInboundMessage): string => {
  const text = message.content.text.trim();

  switch (message.content.kind) {
    case "text":
      return text;
    case "image":
      return text.length > 0 ? `[image] ${text}` : "[image]";
    case "video":
      return text.length > 0 ? `[video] ${text}` : "[video]";
    case "document":
      return text.length > 0 ? `[document] ${text}` : "[document]";
    case "audio":
      return "[audio]";
    case "sticker":
      return "[sticker]";
  }
};

export const appendConversationSessionLogEntry = async (
  log: ConversationSessionLogWriter | undefined,
  entry: ConversationSessionLogEntry,
): Promise<void> => {
  if (!log) {
    return;
  }

  await log.append(entry);
};

export const appendConversationSessionLogEntrySafely = async (
  log: ConversationSessionLogWriter | undefined,
  entry: ConversationSessionLogEntry,
  onError: (error: unknown) => void,
): Promise<void> => {
  try {
    await appendConversationSessionLogEntry(log, entry);
  } catch (error) {
    onError(error);
  }
};

export interface ConversationSessionLogAiTraceInput {
  event: string;
  systemPrompt: string;
  groundingContext?: unknown;
  provider: string;
  usage?: unknown;
  apiResult: unknown;
}

export const appendConversationSessionLogAiTracesSafely = async (input: {
  companyId: string;
  conversationId: string;
  log: ConversationSessionLogWriter | undefined;
  onError: (error: unknown) => void;
  timestamp: number;
  traces?: ConversationSessionLogAiTraceInput[];
}): Promise<void> => {
  for (const trace of input.traces ?? []) {
    await appendConversationSessionLogEntrySafely(input.log, {
      kind: "bts",
      timestamp: input.timestamp,
      companyId: input.companyId,
      conversationId: input.conversationId,
      event: trace.event,
      payload: {
        kind: "ai",
        systemPrompt: trace.systemPrompt,
        ...(trace.groundingContext !== undefined
          ? { groundingContext: trace.groundingContext }
          : {}),
        provider: trace.provider,
        usage: trace.usage,
        apiResult: trace.apiResult,
      },
    }, input.onError);
  }
};

export const getOwnerConversationSessionLog = (
  log: ConversationSessionLogWriter | undefined,
  conversationPhoneNumber: string,
  ownerPhoneNumber: string,
): ConversationSessionLogWriter | undefined =>
  isSamePhoneNumber(conversationPhoneNumber, ownerPhoneNumber) ? log : undefined;
