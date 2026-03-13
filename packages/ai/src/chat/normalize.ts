import type {
  ChatMessageInput,
  ChatRequest,
  ChatTextPart,
  NormalizedChatMessage,
  NormalizedChatRequest,
} from './contracts';

const isBlankText = (value: string): boolean => value.trim().length === 0;

const normalizeMessageContent = (message: ChatMessageInput): ChatTextPart[] => {
  if (typeof message.content === "string") {
    if (isBlankText(message.content)) {
      throw new Error("Chat messages require non-empty text content");
    }

    return [{ type: "text", text: message.content }];
  }

  if (message.content.length === 0) {
    throw new Error("Chat messages require at least one content part");
  }

  return message.content.map((part) => {
    if (isBlankText(part.text)) {
      throw new Error("Chat messages require non-empty text content");
    }

    return { type: "text", text: part.text };
  });
};

const normalizeMessage = (message: ChatMessageInput): NormalizedChatMessage => ({
  role: message.role,
  content: normalizeMessageContent(message),
  ...(message.name !== undefined ? { name: message.name } : {}),
});

export const normalizeChatRequest = (
  request: ChatRequest,
): NormalizedChatRequest => {
  if (request.messages.length === 0) {
    throw new Error("Chat requests require at least one message");
  }

  return {
    messages: request.messages.map(normalizeMessage),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxOutputTokens !== undefined ? { maxOutputTokens: request.maxOutputTokens } : {}),
    ...(request.stopSequences !== undefined ? { stopSequences: request.stopSequences } : {}),
  };
};
