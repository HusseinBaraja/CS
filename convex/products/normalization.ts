export {
  normalizeOptionalNumber,
  normalizeOptionalString,
  normalizeRequiredString,
} from './normalizationPrimitives';

export {
  assertCurrencyIfPriced,
  createProductPatch,
  createVariantPatch,
  mergeUpdateState,
  mergeVariantUpdateState,
  normalizeCreateState,
  normalizeVariantCreateState,
} from './stateTransforms';

export type { ProductCreateState } from './types';
