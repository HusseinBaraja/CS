const RETRIEVAL_REWRITE_CONFIDENCE_VALUES = ["high", "medium", "low"] as const;
const RETRIEVAL_REWRITE_STRATEGY_VALUES = [
  "standalone",
  "recent_history_resolution",
  "quoted_reply_resolution",
] as const;
const RETRIEVAL_REWRITE_UNRESOLVED_REASON_VALUES = [
  "missing_referent",
  "ambiguous_reference",
  "insufficient_history",
  "unclear_product_target",
] as const;

export type RetrievalRewriteConfidence = typeof RETRIEVAL_REWRITE_CONFIDENCE_VALUES[number];
export type RetrievalRewriteStrategy = typeof RETRIEVAL_REWRITE_STRATEGY_VALUES[number];
export type RetrievalRewriteUnresolvedReason = typeof RETRIEVAL_REWRITE_UNRESOLVED_REASON_VALUES[number];

export interface RetrievalRewriteResult {
  resolvedQuery: string;
  confidence: RetrievalRewriteConfidence;
  rewriteStrategy: RetrievalRewriteStrategy;
  preservedTerms: string[];
  searchAliases?: string[];
  unresolvedReason?: RetrievalRewriteUnresolvedReason;
  notes?: string;
}

export const RETRIEVAL_REWRITE_RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resolvedQuery", "confidence", "rewriteStrategy", "preservedTerms"],
  properties: {
    resolvedQuery: {
      type: "string",
      minLength: 1,
    },
    confidence: {
      type: "string",
      enum: [...RETRIEVAL_REWRITE_CONFIDENCE_VALUES],
    },
    rewriteStrategy: {
      type: "string",
      enum: [...RETRIEVAL_REWRITE_STRATEGY_VALUES],
    },
    preservedTerms: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
    },
    searchAliases: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
    },
    unresolvedReason: {
      type: "string",
      enum: [...RETRIEVAL_REWRITE_UNRESOLVED_REASON_VALUES],
    },
    notes: {
      type: "string",
    },
  },
} as const satisfies Record<string, unknown>;

const normalizeStringArray = (
  value: unknown,
  fieldName: string,
): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Retrieval rewrite ${fieldName} must be an array`);
  }

  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error(`Retrieval rewrite ${fieldName} entries must be strings`);
    }

    const normalizedEntry = entry.trim();
    if (normalizedEntry.length === 0) {
      throw new Error(`Retrieval rewrite ${fieldName} entries must be non-empty strings`);
    }

    return normalizedEntry;
  });
};

const normalizeOptionalStringArray = (
  value: unknown,
  fieldName: string,
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return normalizeStringArray(value, fieldName);
};

const normalizeEnumValue = <Value extends string>(
  value: unknown,
  allowedValues: readonly Value[],
  fieldName: string,
): Value => {
  if (typeof value !== "string" || !allowedValues.includes(value as Value)) {
    throw new Error(
      `Retrieval rewrite ${fieldName} must be one of: ${allowedValues.join(", ")}`,
    );
  }

  return value as Value;
};

const normalizeOptionalEnumValue = <Value extends string>(
  value: unknown,
  allowedValues: readonly Value[],
  fieldName: string,
): Value | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return normalizeEnumValue(value, allowedValues, fieldName);
};

export const parseRetrievalRewriteResultPayload = (
  parsedValue: unknown,
  options: {
    normalizeSearchAliases: (entries: string[], resolvedQuery: string) => string[];
  },
): RetrievalRewriteResult => {
  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    throw new Error("Retrieval rewrite output must be a JSON object");
  }

  const parsedRecord = parsedValue as Record<string, unknown>;
  const resolvedQuery = parsedRecord.resolvedQuery;
  if (typeof resolvedQuery !== "string" || resolvedQuery.trim().length === 0) {
    throw new Error("Retrieval rewrite resolvedQuery must be a non-empty string");
  }

  const normalizedResolvedQuery = resolvedQuery.trim();
  const preservedTerms = normalizeStringArray(parsedRecord.preservedTerms, "preservedTerms");
  const searchAliases = normalizeOptionalStringArray(parsedRecord.searchAliases, "searchAliases");
  const unresolvedReason = normalizeOptionalEnumValue(
    parsedRecord.unresolvedReason,
    RETRIEVAL_REWRITE_UNRESOLVED_REASON_VALUES,
    "unresolvedReason",
  );

  if (parsedRecord.notes !== undefined && typeof parsedRecord.notes !== "string") {
    throw new Error("Retrieval rewrite notes must be a string");
  }

  return {
    resolvedQuery: normalizedResolvedQuery,
    confidence: normalizeEnumValue(
      parsedRecord.confidence,
      RETRIEVAL_REWRITE_CONFIDENCE_VALUES,
      "confidence",
    ),
    rewriteStrategy: normalizeEnumValue(
      parsedRecord.rewriteStrategy,
      RETRIEVAL_REWRITE_STRATEGY_VALUES,
      "rewriteStrategy",
    ),
    preservedTerms,
    ...(searchAliases
      ? { searchAliases: options.normalizeSearchAliases(searchAliases, normalizedResolvedQuery) }
      : {}),
    ...(unresolvedReason ? { unresolvedReason } : {}),
    ...(typeof parsedRecord.notes === "string" && parsedRecord.notes.trim().length > 0
      ? { notes: parsedRecord.notes.trim() }
      : {}),
  };
};
