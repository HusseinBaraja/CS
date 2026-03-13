import { GoogleGenAI } from '@google/genai';
import type { GeminiClient, GeminiClientFactory } from './types';

const defaultGeminiClientFactory: GeminiClientFactory = (apiKey) =>
  new GoogleGenAI({ apiKey }) as GeminiClient;

let geminiClientFactory: GeminiClientFactory = defaultGeminiClientFactory;

export const createGeminiClient = (apiKey: string): GeminiClient =>
  geminiClientFactory(apiKey);

export const setGeminiClientFactoryForTests = (factory: GeminiClientFactory): (() => void) => {
  const previousFactory = geminiClientFactory;
  geminiClientFactory = factory;

  return () => {
    geminiClientFactory = previousFactory;
  };
};
