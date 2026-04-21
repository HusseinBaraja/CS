export const CONFLICT_PREFIX = 'CONFLICT';
export const NOT_FOUND_PREFIX = 'NOT_FOUND';
export const VALIDATION_PREFIX = 'VALIDATION_FAILED';

export const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);
