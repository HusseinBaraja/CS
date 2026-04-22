import type { ChatProviderAdapter, ChatProviderName } from '../contracts';
import { deepseekChatProviderAdapter } from './deepseek';
import { geminiChatProviderAdapter } from './gemini';
import { groqChatProviderAdapter } from './groq';

const chatProviderAdapters: Record<ChatProviderName, ChatProviderAdapter> = {
  deepseek: deepseekChatProviderAdapter,
  gemini: geminiChatProviderAdapter,
  groq: groqChatProviderAdapter,
};

export const CHAT_PROVIDER_NAMES = Object.freeze(
  Object.keys(chatProviderAdapters) as ChatProviderName[],
) satisfies readonly ChatProviderName[];

export const getChatProviderAdapter = (
  provider: ChatProviderName,
): ChatProviderAdapter => chatProviderAdapters[provider];
