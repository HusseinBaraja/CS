import { VALIDATION_PREFIX, createTaggedError } from './errors';
import type {
  ProductSpecifications,
  ProductVariantAttributeValue,
  ProductVariantAttributes,
} from './types';

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

export const normalizeSpecifications = (
  value: ProductSpecifications | null | undefined,
): ProductSpecifications | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const seenNormalizedKeys = new Set<string>();
  const normalizedEntries = Object.entries(value).map(([key, entryValue]) => {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) {
      throw createTaggedError(VALIDATION_PREFIX, 'specifications keys must be non-empty strings');
    }

    if (seenNormalizedKeys.has(normalizedKey)) {
      throw createTaggedError(
        VALIDATION_PREFIX,
        'specifications keys must be non-empty strings and unique after trimming',
      );
    }

    seenNormalizedKeys.add(normalizedKey);
    return [normalizedKey, entryValue] as const;
  });

  return Object.fromEntries(normalizedEntries);
};

const normalizeVariantAttributeValue = (
  value: ProductVariantAttributeValue,
  path: string,
): ProductVariantAttributeValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw createTaggedError(VALIDATION_PREFIX, `${path} must be a finite number`);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entryValue, index) =>
      normalizeVariantAttributeValue(entryValue, `${path}[${index}]`),
    );
  }

  if (typeof value === 'object' && value !== null) {
    return normalizeVariantAttributes(value as ProductVariantAttributes, path);
  }

  throw createTaggedError(
    VALIDATION_PREFIX,
    `${path} must be a string, number, boolean, null, object, or array`,
  );
};

export const normalizeVariantAttributes = (
  value: ProductVariantAttributes,
  path = 'attributes',
): ProductVariantAttributes => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createTaggedError(VALIDATION_PREFIX, `${path} must be an object`);
  }

  const attributes: ProductVariantAttributes = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) {
      throw createTaggedError(VALIDATION_PREFIX, `${path} keys must be non-empty strings`);
    }

    if (normalizedKey in attributes) {
      throw createTaggedError(
        VALIDATION_PREFIX,
        `${path} keys must be unique after trimming: ${normalizedKey}`,
      );
    }

    attributes[normalizedKey] = normalizeVariantAttributeValue(
      entryValue as ProductVariantAttributeValue,
      `${path}.${normalizedKey}`,
    );
  }

  return attributes;
};
