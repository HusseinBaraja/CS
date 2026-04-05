import { normalizeTurnResolutionTextForMatch } from "./normalization";

const ORDINAL_MAP: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  "1st": 1,
  "2nd": 2,
  "3rd": 3,
  "4th": 4,
  "5th": 5,
  الاول: 1,
  الأول: 1,
  الثاني: 2,
  الثالث: 3,
  الرابع: 4,
  الخامس: 5,
};

const VARIANT_DESCRIPTOR_SYNONYMS = {
  large: ["large", "larger", "big", "bigger", "الكبير", "كبير", "الكبيرة", "كبيره"],
  medium: ["medium", "mid", "وسط", "متوسط"],
  small: ["small", "smaller", "little", "الصغير", "صغير", "الصغيرة", "صغيره"],
} as const;

export type VariantDescriptor = keyof typeof VARIANT_DESCRIPTOR_SYNONYMS;

export const parseOrdinalIndexes = (value: string): number[] => {
  const normalized = normalizeTurnResolutionTextForMatch(value);
  const indexes = new Set<number>();

  for (const [token, index] of Object.entries(ORDINAL_MAP)) {
    if (normalized.includes(token)) {
      indexes.add(index);
    }
  }

  const numericMatches = normalized.matchAll(/(?:^|\b)(?:number|no|رقم)?\s*(\d+)(?:\b|$)/gu);
  for (const match of numericMatches) {
    const index = Number(match[1]);
    if (Number.isFinite(index) && index > 0) {
      indexes.add(index);
    }
  }

  return [...indexes].sort((left, right) => left - right);
};

export const parseVariantDescriptor = (value: string): VariantDescriptor | null => {
  const normalized = normalizeTurnResolutionTextForMatch(value);

  for (const [descriptor, synonyms] of Object.entries(VARIANT_DESCRIPTOR_SYNONYMS) as Array<
    [VariantDescriptor, readonly string[]]
  >) {
    if (synonyms.some((synonym) => normalized.includes(normalizeTurnResolutionTextForMatch(synonym)))) {
      return descriptor;
    }
  }

  return null;
};

export const matchesVariantDescriptor = (label: string, descriptor: VariantDescriptor): boolean => {
  const normalizedLabel = normalizeTurnResolutionTextForMatch(label);
  return VARIANT_DESCRIPTOR_SYNONYMS[descriptor].some((synonym) =>
    normalizedLabel.includes(normalizeTurnResolutionTextForMatch(synonym))
  );
};
