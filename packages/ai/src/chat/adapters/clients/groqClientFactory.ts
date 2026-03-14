import Groq from 'groq-sdk';
import type { OpenAICompatibleChatClient } from '../shared';

type GroqClientFactory = (config: {
  apiKey: string;
}) => OpenAICompatibleChatClient;

const defaultGroqClientFactory: GroqClientFactory = (config) =>
  new Groq({
    apiKey: config.apiKey,
    maxRetries: 0,
  }) as OpenAICompatibleChatClient;

let groqClientFactory: GroqClientFactory = defaultGroqClientFactory;

export const createGroqClient = (config: {
  apiKey: string;
}): OpenAICompatibleChatClient => groqClientFactory(config);

export const setGroqClientFactoryForTests = (
  factory: GroqClientFactory,
): (() => void) => {
  const previousFactory = groqClientFactory;
  groqClientFactory = factory;

  return () => {
    groqClientFactory = previousFactory;
  };
};
