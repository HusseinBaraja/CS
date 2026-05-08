import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';
import {
  clearProductEmbeddingsInMutation,
  replaceProductEmbeddingsInMutation,
} from '../../productEmbeddingRuntime';
import { CONFLICT_PREFIX, createTaggedError } from '../errors';

export type VariantEmbeddingMutationArgs = {
  companyId: Id<'companies'>;
  productId: Id<'products'>;
  clearEmbeddings?: boolean;
  englishEmbedding?: number[];
  arabicEmbedding?: number[];
  englishText?: string;
  arabicText?: string;
};

export const applyVariantEmbeddingMutation = async (
  ctx: MutationCtx,
  args: VariantEmbeddingMutationArgs,
): Promise<void> => {
  if (args.clearEmbeddings) {
    await clearProductEmbeddingsInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
    });
    return;
  }

  if (
    !args.englishEmbedding ||
    !args.arabicEmbedding ||
    args.englishText === undefined ||
    args.arabicText === undefined
  ) {
    throw createTaggedError(
      CONFLICT_PREFIX,
      'Embedding replacement payload is required',
    );
  }

  await replaceProductEmbeddingsInMutation(ctx, {
    companyId: args.companyId,
    productId: args.productId,
    englishEmbedding: args.englishEmbedding,
    arabicEmbedding: args.arabicEmbedding,
    englishText: args.englishText,
    arabicText: args.arabicText,
  });
};
