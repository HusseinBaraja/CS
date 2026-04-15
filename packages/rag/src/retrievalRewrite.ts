import {
  type ChatLanguage,
  type ChatManagerCallOptions,
  type ChatProviderManager,
  type ChatRequest,
  type GroundingContextBlock,
  type PromptHistoryTurn,
  createRetrievalRewriteChatProviderManager,
} from '@cs/ai';

export type RetrievalHistorySelectionReason =
  | "recent_window"
  | "quoted_reply_slice"
  | "empty";

export type RetrievalRewriteConfidence = "high" | "medium" | "low";

export type RetrievalRewriteStrategy =
  | "standalone"
  | "recent_history_resolution"
  | "quoted_reply_resolution";

export type RetrievalRewriteUnresolvedReason =
  | "missing_referent"
  | "ambiguous_reference"
  | "insufficient_history"
  | "unclear_product_target";

export type RetrievalMode =
  | "primary_rewrite"
  | "rewrite_degraded";

export type RetrievalQuerySource =
  | "resolved_query"
  | "search_alias"
  | "fallback_original_user_message"
  | "fallback_quoted_message_plus_current_message";

export type RetrievalRewriteFailureReason =
  | "invalid_output"
  | "parse_failed"
  | "provider_error"
  | "timeout"
  | "low_confidence";

export interface CatalogChatConversationHistorySelection {
  reason: RetrievalHistorySelectionReason;
  quotedMessage?: PromptHistoryTurn;
}

export interface RetrievalRewriteInput {
  currentUserMessage: string;
  selectedHistory: PromptHistoryTurn[];
  historySelectionReason: RetrievalHistorySelectionReason;
  quotedMessage?: PromptHistoryTurn;
  responseLanguageHint: ChatLanguage;
  catalogLanguageHints?: ChatLanguage[];
}

export interface RetrievalRewriteResult {
  resolvedQuery: string;
  confidence: RetrievalRewriteConfidence;
  rewriteStrategy: RetrievalRewriteStrategy;
  preservedTerms: string[];
  searchAliases?: string[];
  unresolvedReason?: RetrievalRewriteUnresolvedReason;
  notes?: string;
}

export type RetrievalRewriteAttempt =
  | {
    status: "success";
    result: RetrievalRewriteResult;
  }
  | {
    status: "failure";
    failureReason: RetrievalRewriteFailureReason;
    result?: RetrievalRewriteResult;
  };

export interface RetrievalRewriteService {
  rewrite(
    input: RetrievalRewriteInput,
    options?: ChatManagerCallOptions,
  ): Promise<RetrievalRewriteAttempt>;
}

export interface CreateRetrievalRewriteServiceOptions {
  chatManager?: ChatProviderManager;
}

export interface RetrievalPlannedQuery {
  text: string;
  source: RetrievalQuerySource;
}

export interface RetrievalQueryPlan {
  mode: RetrievalMode;
  primaryQuery: string;
  queries: RetrievalPlannedQuery[];
  rewriteAttempt?: RetrievalRewriteAttempt;
}

export interface MergeableRetrievedCandidate {
  productId: string;
  score: number;
  contextBlock: GroundingContextBlock;
}

export interface MergeableRetrievalResult<Candidate extends MergeableRetrievedCandidate = MergeableRetrievedCandidate> {
  outcome: "grounded" | "empty" | "low_signal";
  reason?: string;
  query: string;
  language: ChatLanguage;
  topScore?: number;
  candidates: Candidate[];
  contextBlocks: GroundingContextBlock[];
}

export interface RetrievalQueryProvenance {
  query: string;
  source: RetrievalQuerySource;
  score: number;
}

export type MergedRetrievalCandidate<Candidate extends MergeableRetrievedCandidate> =
  Candidate & {
    queryProvenance: RetrievalQueryProvenance[];
  };

export interface MergedRetrievalResult<Candidate extends MergeableRetrievedCandidate>
  extends Omit<MergeableRetrievalResult<Candidate>, "candidates"> {
  candidates: Array<MergedRetrievalCandidate<Candidate>>;
}

const RETRIEVAL_REWRITE_CONFIDENCE_VALUES: RetrievalRewriteConfidence[] = ["high", "medium", "low"];
const RETRIEVAL_REWRITE_STRATEGY_VALUES: RetrievalRewriteStrategy[] = [
  "standalone",
  "recent_history_resolution",
  "quoted_reply_resolution",
];
const RETRIEVAL_REWRITE_UNRESOLVED_REASON_VALUES: RetrievalRewriteUnresolvedReason[] = [
  "missing_referent",
  "ambiguous_reference",
  "insufficient_history",
  "unclear_product_target",
];

const SEARCH_ALIAS_LIMIT = 2;

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

const normalizeUniqueQueries = (
  entries: string[],
  excludedQuery: string,
  limit: number,
): string[] => {
  const seen = new Set<string>([excludedQuery]);
  const uniqueEntries: string[] = [];

  for (const entry of entries) {
    if (seen.has(entry)) {
      continue;
    }

    seen.add(entry);
    uniqueEntries.push(entry);
    if (uniqueEntries.length >= limit) {
      break;
    }
  }

  return uniqueEntries;
};

const normalizeUserMessage = (value: string): string => value.trim();

const escapeForDelimiter = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const serializePromptHistoryTurn = (turn: PromptHistoryTurn): string =>
  [
    `<TURN role="${turn.role}">`,
    escapeForDelimiter(turn.text),
    "</TURN>",
  ].join("\n");

const buildRetrievalRewritePrompt = (
  input: RetrievalRewriteInput,
): ChatRequest => {
  const systemPrompt = [
    "You improve internal catalog retrieval queries for CSCB.",
    "You are not answering the customer.",
    "Use only the current message and the selected history slice.",
    "Resolve references such as 'the third one', 'that one', and quoted replies when supported by the conversation.",
    "Preserve uncertainty instead of inventing details.",
    "Do not add product facts, categories, attributes, prices, or availability that are not grounded in the conversation.",
    "Preserve the user's language in resolvedQuery.",
    "Return raw JSON only using this exact schema:",
    '{"resolvedQuery":"<string>","confidence":"high|medium|low","rewriteStrategy":"standalone|recent_history_resolution|quoted_reply_resolution","preservedTerms":["<string>"],"searchAliases":["<string>"],"unresolvedReason":"missing_referent|ambiguous_reference|insufficient_history|unclear_product_target","notes":"<string>"}',
  ].join("\n");

  const userPrompt = [
    "<CURRENT_USER_MESSAGE>",
    escapeForDelimiter(input.currentUserMessage),
    "</CURRENT_USER_MESSAGE>",
    "<SELECTED_HISTORY_REASON>",
    input.historySelectionReason,
    "</SELECTED_HISTORY_REASON>",
    "<SELECTED_HISTORY>",
    input.selectedHistory.length > 0
      ? input.selectedHistory.map(serializePromptHistoryTurn).join("\n")
      : "NO_SELECTED_HISTORY",
    "</SELECTED_HISTORY>",
    ...(input.quotedMessage
      ? [
        "<QUOTED_MESSAGE>",
        serializePromptHistoryTurn(input.quotedMessage),
        "</QUOTED_MESSAGE>",
      ]
      : []),
    "<RESPONSE_LANGUAGE_HINT>",
    input.responseLanguageHint,
    "</RESPONSE_LANGUAGE_HINT>",
    ...(input.catalogLanguageHints && input.catalogLanguageHints.length > 0
      ? [
        "<CATALOG_LANGUAGE_HINTS>",
        input.catalogLanguageHints.join(", "),
        "</CATALOG_LANGUAGE_HINTS>",
      ]
      : []),
  ].join("\n");

  return {
    temperature: 0,
    maxOutputTokens: 250,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  };
};

const classifyRetrievalRewriteFailure = (error: unknown): RetrievalRewriteFailureReason => {
  const errorWithCode = error as Error & { code?: string };
  if (errorWithCode?.code === "AI_TIMEOUT" || errorWithCode?.name === "AbortError") {
    return "timeout";
  }

  return "provider_error";
};

export const createRetrievalRewriteService = (
  options: CreateRetrievalRewriteServiceOptions = {},
): RetrievalRewriteService => {
  const chatManager = options.chatManager ?? createRetrievalRewriteChatProviderManager();

  return {
    async rewrite(
      input: RetrievalRewriteInput,
      chatOptions: ChatManagerCallOptions = {},
    ): Promise<RetrievalRewriteAttempt> {
      let responseText: string;
      try {
        const response = await chatManager.chat(
          buildRetrievalRewritePrompt(input),
          {
            ...chatOptions,
            logContext: {
              ...chatOptions.logContext,
              feature: "catalog_retrieval_rewrite",
            },
          },
        );
        responseText = response.text;
      } catch (error) {
        return {
          status: "failure",
          failureReason: classifyRetrievalRewriteFailure(error),
        };
      }

      try {
        const parsedResult = parseRetrievalRewriteResult(responseText);
        if (parsedResult.confidence === "low") {
          return {
            status: "failure",
            failureReason: "low_confidence",
            result: parsedResult,
          };
        }

        return {
          status: "success",
          result: parsedResult,
        };
      } catch (error) {
        return {
          status: "failure",
          failureReason:
            error instanceof Error
              && error.message === "Retrieval rewrite output must be valid JSON"
              ? "parse_failed"
              : "invalid_output",
        };
      }
    },
  };
};

export const buildRetrievalRewriteInput = (input: {
  userMessage: string;
  conversation?: {
    history?: PromptHistoryTurn[];
    historySelection?: CatalogChatConversationHistorySelection;
  };
  responseLanguageHint: ChatLanguage;
  catalogLanguageHints?: ChatLanguage[];
}): RetrievalRewriteInput => {
  const selectedHistory = input.conversation?.history ?? [];
  const explicitHistorySelection = input.conversation?.historySelection;
  const historySelectionReason = explicitHistorySelection?.reason
    ?? (selectedHistory.length > 0 ? "recent_window" : "empty");
  const quotedMessage = historySelectionReason === "quoted_reply_slice"
    ? explicitHistorySelection?.quotedMessage
    : undefined;

  return {
    currentUserMessage: input.userMessage,
    selectedHistory,
    historySelectionReason,
    ...(quotedMessage ? { quotedMessage } : {}),
    responseLanguageHint: input.responseLanguageHint,
    ...(input.catalogLanguageHints ? { catalogLanguageHints: input.catalogLanguageHints } : {}),
  };
};

export const parseRetrievalRewriteResult = (
  responseText: string,
): RetrievalRewriteResult => {
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(responseText);
  } catch (error) {
    const parseError = new Error("Retrieval rewrite output must be valid JSON");
    parseError.cause = error;
    throw parseError;
  }

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
      ? { searchAliases: normalizeUniqueQueries(searchAliases, normalizedResolvedQuery, SEARCH_ALIAS_LIMIT) }
      : {}),
    ...(unresolvedReason ? { unresolvedReason } : {}),
    ...(typeof parsedRecord.notes === "string" && parsedRecord.notes.trim().length > 0
      ? { notes: parsedRecord.notes.trim() }
      : {}),
  };
};

export const buildQuotedMessageCombinedFallbackQuery = (
  quotedMessage: PromptHistoryTurn | undefined,
  userMessage: string,
): string | undefined => {
  const quotedText = quotedMessage?.text.trim();
  const normalizedUserMessage = normalizeUserMessage(userMessage);

  if (!quotedText || normalizedUserMessage.length === 0) {
    return undefined;
  }

  return `${quotedText}\n${normalizedUserMessage}`;
};

export const buildRetrievalQueryPlan = (input: {
  userMessage: string;
  quotedMessage?: PromptHistoryTurn;
  rewriteAttempt?: RetrievalRewriteAttempt;
}): RetrievalQueryPlan => {
  const normalizedUserMessage = normalizeUserMessage(input.userMessage);
  const rewriteAttempt = input.rewriteAttempt;

  if (rewriteAttempt?.status === "success") {
    const primaryQuery = rewriteAttempt.result.resolvedQuery.trim();
    const aliasQueries = normalizeUniqueQueries(
      rewriteAttempt.result.searchAliases ?? [],
      primaryQuery,
      SEARCH_ALIAS_LIMIT,
    );

    return {
      mode: "primary_rewrite",
      primaryQuery,
      queries: [
        {
          text: primaryQuery,
          source: "resolved_query",
        },
        ...aliasQueries.map((aliasQuery) => ({
          text: aliasQuery,
          source: "search_alias" as const,
        })),
      ],
      rewriteAttempt,
    };
  }

  const fallbackQueries: RetrievalPlannedQuery[] = [{
    text: normalizedUserMessage,
    source: "fallback_original_user_message",
  }];
  const combinedFallbackQuery = buildQuotedMessageCombinedFallbackQuery(
    input.quotedMessage,
    normalizedUserMessage,
  );

  if (
    combinedFallbackQuery
    && combinedFallbackQuery !== normalizedUserMessage
  ) {
    fallbackQueries.push({
      text: combinedFallbackQuery,
      source: "fallback_quoted_message_plus_current_message",
    });
  }

  return {
    mode: "rewrite_degraded",
    primaryQuery: normalizedUserMessage,
    queries: fallbackQueries,
    ...(rewriteAttempt ? { rewriteAttempt } : {}),
  };
};

const compareMergedCandidates = <Candidate extends MergeableRetrievedCandidate>(
  left: MergedRetrievalCandidate<Candidate>,
  right: MergedRetrievalCandidate<Candidate>,
): number =>
  right.score - left.score
  || right.queryProvenance[0]!.score - left.queryProvenance[0]!.score
  || left.productId.localeCompare(right.productId);

export const mergeRetrievalResults = <Candidate extends MergeableRetrievedCandidate>(input: {
  queryPlan: RetrievalQueryPlan;
  retrievals: Array<MergeableRetrievalResult<Candidate>>;
  maxContextBlocks: number;
}): MergedRetrievalResult<Candidate> => {
  const querySourceByText = new Map(input.queryPlan.queries.map((query) => [query.text, query.source] as const));
  const mergedByProductId = new Map<string, MergedRetrievalCandidate<Candidate>>();
  const primaryRetrieval = input.retrievals.find((retrieval) => retrieval.query === input.queryPlan.primaryQuery)
    ?? input.retrievals[0];
  let language: ChatLanguage | undefined;

  for (const retrieval of input.retrievals) {
    language ??= retrieval.language;
    const source = querySourceByText.get(retrieval.query) ?? "resolved_query";

    for (const candidate of retrieval.candidates) {
      const existingCandidate = mergedByProductId.get(candidate.productId);
      const nextProvenanceEntry: RetrievalQueryProvenance = {
        query: retrieval.query,
        source,
        score: candidate.score,
      };

      if (!existingCandidate) {
        mergedByProductId.set(candidate.productId, {
          ...candidate,
          queryProvenance: [nextProvenanceEntry],
        });
        continue;
      }

      const hasExistingProvenance = existingCandidate.queryProvenance.some((entry) =>
        entry.query === nextProvenanceEntry.query && entry.source === nextProvenanceEntry.source
      );
      const nextQueryProvenance = hasExistingProvenance
        ? existingCandidate.queryProvenance
        : [...existingCandidate.queryProvenance, nextProvenanceEntry].sort((left, right) =>
          right.score - left.score || left.query.localeCompare(right.query)
        );

      if (candidate.score > existingCandidate.score) {
        mergedByProductId.set(candidate.productId, {
          ...candidate,
          queryProvenance: nextQueryProvenance,
        });
        continue;
      }

      mergedByProductId.set(candidate.productId, {
        ...existingCandidate,
        queryProvenance: nextQueryProvenance,
      });
    }
  }

  const mergedCandidates = [...mergedByProductId.values()].sort(compareMergedCandidates);
  const topScore = mergedCandidates[0]?.score;
  const hasGroundedResult = input.retrievals.some((retrieval) => retrieval.outcome === "grounded");

  if (mergedCandidates.length === 0) {
    return {
      outcome: "empty",
      reason: primaryRetrieval?.reason === "empty_query" ? "empty_query" : "no_hits",
      query: input.queryPlan.primaryQuery,
      language: language ?? "en",
      candidates: [],
      contextBlocks: [],
    };
  }

  if (!hasGroundedResult) {
    return {
      outcome: "low_signal",
      reason: "below_min_score",
      query: input.queryPlan.primaryQuery,
      language: language ?? "en",
      topScore,
      candidates: mergedCandidates,
      contextBlocks: [],
    };
  }

  return {
    outcome: "grounded",
    query: input.queryPlan.primaryQuery,
    language: language ?? "en",
    topScore,
    candidates: mergedCandidates,
    contextBlocks: mergedCandidates
      .slice(0, Math.max(0, Math.trunc(input.maxContextBlocks)))
      .map((candidate) => candidate.contextBlock),
  };
};
