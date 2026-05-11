import { VALIDATION_PREFIX, createTaggedError } from './errors';

export const normalizeRequiredString = (value: string, fieldName: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} is required`);
  }

  return normalized;
};

export const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const normalizeOptionalNumber = (
  value: number | null | undefined,
  fieldName: string,
): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw createTaggedError(VALIDATION_PREFIX, `${fieldName} must be a non-negative number`);
  }

  return value;
};
