import { GoogleGenAI } from '@google/genai';
import type { GeminiClientFactory, GeminiEmbeddingClient } from './types';

const defaultGeminiClientFactory: GeminiClientFactory = (apiKey) =>
  new GoogleGenAI({ apiKey }) as GeminiEmbeddingClient;

let geminiClientFactory: GeminiClientFactory = defaultGeminiClientFactory;

export const createGeminiClient = (apiKey: string): GeminiEmbeddingClient =>
  geminiClientFactory(apiKey);

export const setGeminiClientFactoryForTests = (factory: GeminiClientFactory): (() => void) => {
  const previousFactory = geminiClientFactory;
  geminiClientFactory = factory;

  return () => {
    geminiClientFactory = previousFactory;
  };
};
