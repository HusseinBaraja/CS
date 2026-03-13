import type { ChatProviderAdapter, ChatProviderName } from '../contracts';
import { deepseekChatProviderAdapter } from './deepseek';
import { geminiChatProviderAdapter } from './gemini';
import { groqChatProviderAdapter } from './groq';

export const chatProviderAdapters: Record<ChatProviderName, ChatProviderAdapter> = {
  deepseek: deepseekChatProviderAdapter,
  gemini: geminiChatProviderAdapter,
  groq: groqChatProviderAdapter,
};

export const getChatProviderAdapter = (
  provider: ChatProviderName,
): ChatProviderAdapter => chatProviderAdapters[provider];
