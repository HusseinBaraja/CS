import OpenAI from 'openai';
import type { OpenAICompatibleChatClient } from '../shared';

type DeepSeekClientFactory = (config: {
  apiKey: string;
  baseUrl: string;
}) => OpenAICompatibleChatClient;

const defaultDeepSeekClientFactory: DeepSeekClientFactory = (config) =>
  new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 0,
  }) as OpenAICompatibleChatClient;

let deepSeekClientFactory: DeepSeekClientFactory = defaultDeepSeekClientFactory;

export const createDeepSeekClient = (config: {
  apiKey: string;
  baseUrl: string;
}): OpenAICompatibleChatClient => deepSeekClientFactory(config);

export const setDeepSeekClientFactoryForTests = (
  factory: DeepSeekClientFactory,
): (() => void) => {
  const previousFactory = deepSeekClientFactory;
  deepSeekClientFactory = factory;

  return () => {
    deepSeekClientFactory = previousFactory;
  };
};
