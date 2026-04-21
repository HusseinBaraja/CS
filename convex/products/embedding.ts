import { VALIDATION_PREFIX, createTaggedError } from './errors';
import type {
  ProductEmbeddingReplacementArgs,
  ProductEmbeddingReplacementInput,
} from './types';

export const getEmbeddingReplacementArgs = (
  args: ProductEmbeddingReplacementInput,
): ProductEmbeddingReplacementArgs | null => {
  const embeddingValues = [
    args.englishEmbedding,
    args.arabicEmbedding,
    args.englishText,
    args.arabicText,
  ];
  const hasAnyEmbeddingValue = embeddingValues.some((value) => value !== undefined);
  const hasAllEmbeddingValues = embeddingValues.every((value) => value !== undefined);

  if (hasAnyEmbeddingValue && !hasAllEmbeddingValues) {
    throw createTaggedError(VALIDATION_PREFIX, 'Embedding replacement payload must be all-or-none');
  }

  if (!hasAllEmbeddingValues) {
    return null;
  }

  return {
    companyId: args.companyId,
    productId: args.productId,
    englishEmbedding: args.englishEmbedding!,
    arabicEmbedding: args.arabicEmbedding!,
    englishText: args.englishText!,
    arabicText: args.arabicText!,
  };
};
