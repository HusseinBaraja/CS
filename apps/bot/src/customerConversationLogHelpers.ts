import {
  type ConversationSessionLogEntry,
  type ConversationSessionLogWriter,
  summarizeTextForLog,
} from "@cs/core";
import type { NormalizedInboundMessage } from "@cs/shared";

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

export const getAnalyticsIdempotencyKey = (pendingMessageId: string): string =>
  `pendingMessage:${pendingMessageId}:handoff_started`;

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
