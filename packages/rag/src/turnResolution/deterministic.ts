import type {
  CanonicalConversationPresentedListDto,
  ResolvedUserTurn,
  TurnReferencedEntity,
  TurnResolutionInput,
  TurnResolutionProvenance,
  TurnResolutionProvenanceSource,
  TurnSelectedResolutionSource,
} from '@cs/shared';
import { buildClarificationTurn } from "./clarification";
import {
  extractNumberedLines,
  extractRecentTopicSeed,
  findLatestAssistantTurn,
  normalizeTurnResolutionText,
  normalizeTurnResolutionTextForMatch,
} from "./normalization";
import {
  matchesVariantDescriptor,
  parseOrdinalIndexes,
  parseVariantDescriptor,
  type VariantDescriptor,
} from "./ordinals";
import {
  canUseCanonicalSourceForBinding,
  getSingleReferencedEntity,
  hasValidReferencedEntityAnchor,
  isFreshCanonicalContext,
} from "./validation";
import type { TurnResolutionShadowCandidateFamily } from "./modelAssisted";

interface ResolutionSourceContext {
  source: TurnSelectedResolutionSource;
  usableForBinding: boolean;
  text?: string;
  referencedEntities: TurnReferencedEntity[];
  presentedList?: CanonicalConversationPresentedListDto;
  provenance: TurnResolutionProvenanceSource;
}

export interface DeterministicTurnResolutionResult {
  resolvedTurn: ResolvedUserTurn;
  shadowCandidateFamily: TurnResolutionShadowCandidateFamily | null;
}

const ENGLISH_SPEC_QUERY_REWRITE_RULES: Array<{ pattern: RegExp; rewrite: (seed: string) => string }> = [
  {
    pattern: /\bwhat sizes does it come in\b/i,
    rewrite: (seed) => `What sizes does ${seed} come in?`,
  },
  {
    pattern: /\bdoes it have a lid\b/i,
    rewrite: (seed) => `Does ${seed} have a lid?`,
  },
];

const isImageRequest = (value: string): boolean => {
  const normalized = normalizeTurnResolutionTextForMatch(value);
  return ["image", "picture", "photo", "pic", "صور", "صورة", "صورته", "صورتها"]
    .some((token) => normalized.includes(token));
};

const isPriceQuestion = (value: string): boolean => {
  const normalized = normalizeTurnResolutionTextForMatch(value);
  return normalized.includes("how much") || normalized.includes("price") || normalized.includes("سعر");
};

const isReferentialFollowUp = (value: string): boolean => {
  const normalized = normalizeTurnResolutionTextForMatch(value);
  return [
    /\bit\b/u,
    /\bits\b/u,
    /\bone\b/u,
    /\bsame as before\b/u,
    /\bbefore\b/u,
    /\bهذا\b/u,
    /\bهذه\b/u,
    /\bمنه\b/u,
    /\bمنها\b/u,
    /\bصورته\b/u,
    /\bصورتها\b/u,
  ].some((pattern) => pattern.test(normalized))
    || parseOrdinalIndexes(value).length > 0
    || parseVariantDescriptor(value) !== null
    || isImageRequest(value)
    || isPriceQuestion(value);
};

const isStandaloneCatalogSearch = (value: string): boolean => {
  const normalized = normalizeTurnResolutionText(value);
  return normalized.length > 0 && !isReferentialFollowUp(normalized);
};

const isClarificationQuestionTurn = (value: string): boolean => {
  const normalized = normalizeTurnResolutionTextForMatch(value);
  return normalized.includes("which one")
    || normalized.includes("which size")
    || normalized.includes("أي واحد")
    || normalized.includes("أي مقاس");
};

const buildRawTextProvenance = (): TurnResolutionProvenanceSource => ({
  source: "raw_text",
  evidence: [],
});

const buildCanonicalPathProvenance = (
  source: Extract<TurnSelectedResolutionSource, "current_focus" | "last_presented_list" | "pending_clarification">,
  path: string,
): TurnResolutionProvenanceSource => ({
  source,
  evidence: [{ kind: "canonical_state_path", value: path }],
});

const toSourceContexts = (input: TurnResolutionInput): ResolutionSourceContext[] => {
  const contexts: ResolutionSourceContext[] = [];
  const freshCanonicalContext = canUseCanonicalSourceForBinding(input);

  if (input.quotedReference) {
    contexts.push({
      source: "quoted_reference",
      usableForBinding: true,
      text: input.quotedReference.text,
      referencedEntities: input.quotedReference.referencedEntities ?? [],
      presentedList: input.quotedReference.presentedList,
      provenance: {
        source: "quoted_reference",
        evidence: [
          ...(input.quotedReference.transportMessageId
            ? [{ kind: "transport_message_id" as const, value: input.quotedReference.transportMessageId }]
            : []),
          ...(input.quotedReference.conversationMessageId
            ? [{ kind: "conversation_message_id" as const, value: input.quotedReference.conversationMessageId }]
            : []),
        ],
      },
    });
  }

  const currentFocus = input.canonicalState?.currentFocus;
  if (currentFocus && currentFocus.kind !== "none" && currentFocus.kind !== "catalog_slice") {
    const currentFocusKind = currentFocus.kind as Extract<typeof currentFocus.kind, "category" | "product" | "variant">;
    contexts.push({
      source: "current_focus",
      usableForBinding: freshCanonicalContext,
      referencedEntities: currentFocus.entityIds.map((entityId) => ({
        entityKind: currentFocusKind,
        entityId,
        source: "current_focus",
        confidence: currentFocus.entityIds.length === 1 ? "high" : "medium",
      })),
      provenance: buildCanonicalPathProvenance("current_focus", "currentFocus"),
    });
  }

  if (input.canonicalState?.lastPresentedList) {
    contexts.push({
      source: "last_presented_list",
      usableForBinding: freshCanonicalContext,
      referencedEntities: input.canonicalState.lastPresentedList.items
        .filter((item): item is typeof item & { entityKind: Exclude<typeof item.entityKind, "catalog_slice"> } =>
          item.entityKind !== "catalog_slice"
        )
        .map((item) => ({
          entityKind: item.entityKind,
          entityId: item.entityId,
          source: "last_presented_list",
          confidence: "medium",
        })),
      presentedList: input.canonicalState.lastPresentedList,
      provenance: buildCanonicalPathProvenance("last_presented_list", "lastPresentedList"),
    });
  }

  if (input.canonicalState?.pendingClarification.active) {
    contexts.push({
      source: "pending_clarification",
      usableForBinding: freshCanonicalContext,
      referencedEntities: [],
      provenance: buildCanonicalPathProvenance("pending_clarification", "pendingClarification"),
    });
  }

  const semanticRecords = input.semanticAssistantRecords ?? [];
  const maxSemanticDepth = Math.max(
    1,
    input.resolutionPolicy.maxSemanticFallbackDepth ?? semanticRecords.length ?? 1,
  );
  for (const record of semanticRecords.slice(0, maxSemanticDepth)) {
    contexts.push({
      source: "semantic_assistant_record",
      usableForBinding: input.resolutionPolicy.allowSemanticAssistantFallback,
      referencedEntities: record.referencedEntities.map((entity) => ({
        ...entity,
        source: "semantic_assistant_record",
      })),
      presentedList: record.presentedList,
      provenance: {
        source: "semantic_assistant_record",
        evidence: [{ kind: "assistant_semantic_record_id", value: record.semanticRecordId }],
      },
    });
  }

  if (input.recentTurns.length > 0) {
    contexts.push({
      source: "recent_turns",
      usableForBinding: true,
      text: input.recentTurns.map((turn) => turn.text).join("\n"),
      referencedEntities: [],
      provenance: { source: "recent_turns", evidence: [] },
    });
  }

  if (input.conversationSummary) {
    contexts.push({
      source: "summary",
      usableForBinding: input.resolutionPolicy.allowSummarySupport,
      text: [
        input.conversationSummary.durableCustomerGoal,
        ...input.conversationSummary.historicalContextNeededForFutureTurns,
      ].filter((value): value is string => Boolean(value)).join(" "),
      referencedEntities: [],
      provenance: {
        source: "summary",
        evidence: [{ kind: "summary_id", value: input.conversationSummary.summaryId }],
      },
    });
  }

  contexts.push({
    source: "raw_text",
    usableForBinding: true,
    text: input.rawInboundText,
    referencedEntities: [],
    provenance: buildRawTextProvenance(),
  });

  return contexts;
};

const makeProvenance = (
  selected: ResolutionSourceContext,
  contexts: ResolutionSourceContext[],
  referencedEntities: TurnReferencedEntity[],
): TurnResolutionProvenance => {
  const conflictingSources: TurnResolutionProvenanceSource[] = [];
  const supportingSources: TurnResolutionProvenanceSource[] = [];
  const discardedSources: TurnResolutionProvenanceSource[] = [];
  const referencedIds = new Set(referencedEntities.map((entity) => entity.entityId));

  for (const context of contexts) {
    if (context.source === selected.source && context.provenance.evidence === selected.provenance.evidence) {
      continue;
    }

    const contextIds = new Set(context.referencedEntities.map((entity) => entity.entityId));
    const overlaps = [...contextIds].some((entityId) => referencedIds.has(entityId));
    if (!context.usableForBinding) {
      discardedSources.push(context.provenance);
      continue;
    }

    if (contextIds.size > 0 && !overlaps && referencedIds.size > 0) {
      conflictingSources.push(context.provenance);
      continue;
    }

    if (overlaps || context.source === "summary") {
      supportingSources.push(context.provenance);
    }
  }

  return {
    selectedSources: [selected.provenance],
    supportingSources,
    conflictingSources,
    discardedSources,
  };
};

const resolveOrdinalFromContext = (
  context: ResolutionSourceContext,
  indexes: number[],
): {
  referencedEntities: TurnReferencedEntity[];
  presentedListTarget: ResolvedUserTurn["presentedListTarget"];
} | null => {
  const list = context.presentedList;
  if (!list || indexes.length === 0) {
    return null;
  }

  const listItems = indexes.map((index) => list.items.find((item) => item.displayIndex === index)).filter(Boolean);
  if (listItems.length !== indexes.length) {
    return null;
  }

  const sourceListId = context.source === "quoted_reference"
    ? `quoted_reference:${context.provenance.evidence[0]?.value ?? "unknown"}`
    : `${context.source}:${context.provenance.evidence[0]?.value ?? "current"}`;

  return {
    referencedEntities: listItems
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item): item is typeof item & { entityKind: Exclude<typeof item.entityKind, "catalog_slice"> } =>
        item.entityKind !== "catalog_slice"
      )
      .map((item) => ({
        entityKind: item.entityKind,
        entityId: item.entityId,
        source: context.source,
        confidence: "high",
      })),
    presentedListTarget: {
      sourceListId,
      listKind: list.kind,
      targetedDisplayIndexes: indexes,
    },
  };
};

const resolveVariantDescriptorFromContext = (
  context: ResolutionSourceContext,
  descriptor: VariantDescriptor,
): TurnReferencedEntity | null => {
  const presentedList = context.presentedList;
  if (!presentedList || presentedList.kind !== "variant") {
    return null;
  }

  const numberedLines = context.text ? extractNumberedLines(context.text) : [];
  for (const line of numberedLines) {
    if (!matchesVariantDescriptor(line.label, descriptor)) {
      continue;
    }

    const item = presentedList.items.find((candidate) => candidate.displayIndex === line.displayIndex);
    if (item && item.entityKind === "variant") {
      return {
        entityKind: "variant",
        entityId: item.entityId,
        source: context.source,
        confidence: "high",
      };
    }
  }

  return null;
};

const selectSeedText = (input: TurnResolutionInput, context: ResolutionSourceContext): string | null => {
  const canonicalSeed = input.canonicalState?.latestStandaloneQuery?.text;
  if (canonicalSeed && canonicalSeed.trim().length > 0) {
    return normalizeTurnResolutionText(canonicalSeed);
  }

  const recordSeed = input.semanticAssistantRecords
    ?.find((record) => record.resolvedStandaloneQueryUsed?.status === "used")
    ?.resolvedStandaloneQueryUsed?.text;
  if (recordSeed && recordSeed.trim().length > 0) {
    return normalizeTurnResolutionText(recordSeed);
  }

  if (context.text) {
    const numberedLine = extractNumberedLines(context.text)[0]?.label;
    if (numberedLine) {
      return numberedLine;
    }
  }

  return extractRecentTopicSeed(input.recentTurns);
};

const rewriteSemanticFollowUpQuery = (
  rawInboundText: string,
  language: "ar" | "en",
  seedText: string,
): string => {
  const normalizedRaw = normalizeTurnResolutionText(rawInboundText);
  if (language === "en") {
    for (const rule of ENGLISH_SPEC_QUERY_REWRITE_RULES) {
      if (rule.pattern.test(normalizedRaw)) {
        return rule.rewrite(seedText);
      }
    }

    return `${seedText} ${normalizedRaw}`.trim();
  }

  if (normalizeTurnResolutionTextForMatch(normalizedRaw).includes("مقاس")) {
    return `ما المقاسات المتوفرة في ${seedText}؟`;
  }

  return `${seedText} ${normalizedRaw}`.trim();
};

const finalizeResolvedTurn = (resolvedTurn: ResolvedUserTurn, input: TurnResolutionInput): ResolvedUserTurn => {
  if (resolvedTurn.clarificationRequired) {
    return resolvedTurn;
  }

  if (resolvedTurn.resolutionConfidence === "medium" && !input.resolutionPolicy.allowMediumConfidenceProceed) {
    return buildClarificationTurn({
      rawInboundText: resolvedTurn.rawInboundText,
      normalizedInboundText: resolvedTurn.normalizedInboundText,
      language: resolvedTurn.language,
      selectedResolutionSource: resolvedTurn.selectedResolutionSource,
      resolutionConfidence: "low",
      clarificationReason: "low_confidence_resolution",
      clarificationTarget: "referent",
      promptStrategy: "ask_to_restate",
      referencedEntities: resolvedTurn.referencedEntities,
      provenance: resolvedTurn.provenance,
    });
  }

  return resolvedTurn;
};

const createResolvedTurn = (
  input: TurnResolutionInput,
  selectedContext: ResolutionSourceContext,
  overrides: Omit<ResolvedUserTurn, "rawInboundText" | "normalizedInboundText" | "selectedResolutionSource" | "provenance" | "language">,
): ResolvedUserTurn => finalizeResolvedTurn({
  rawInboundText: input.rawInboundText,
  normalizedInboundText: normalizeTurnResolutionText(input.rawInboundText),
  selectedResolutionSource: selectedContext.source,
  provenance: makeProvenance(selectedContext, toSourceContexts(input), overrides.referencedEntities),
  language: input.languageHint ?? (/[\u0600-\u06FF]/u.test(input.rawInboundText) ? "ar" : "en"),
  ...overrides,
}, input);

export const resolveUserTurnDeterministically = (
  input: TurnResolutionInput,
): DeterministicTurnResolutionResult => {
  const normalizedInboundText = normalizeTurnResolutionText(input.rawInboundText);
  const language = input.languageHint ?? (/[\u0600-\u06FF]/u.test(input.rawInboundText) ? "ar" : "en");
  const contexts = toSourceContexts(input);
  const ordinalIndexes = parseOrdinalIndexes(normalizedInboundText);
  const variantDescriptor = parseVariantDescriptor(normalizedInboundText);
  const latestAssistantTurn = findLatestAssistantTurn(input.recentTurns);
  const isClarificationFallbackTurn =
    !input.canonicalState?.pendingClarification.active
    && Boolean(latestAssistantTurn?.text && isClarificationQuestionTurn(latestAssistantTurn.text));

  if (ordinalIndexes.length > 0) {
    for (const context of contexts) {
      if (!context.usableForBinding) {
        continue;
      }

      const ordinalResolution = resolveOrdinalFromContext(context, ordinalIndexes);
      if (!ordinalResolution || ordinalResolution.referencedEntities.length === 0) {
        continue;
      }

      const primaryEntity = ordinalResolution.referencedEntities[0] ?? null;
      return {
        resolvedTurn: createResolvedTurn(input, context, {
          resolvedIntent:
            input.canonicalState?.pendingClarification.active || isClarificationFallbackTurn
              ? "clarification_answer"
              : "entity_followup",
          preferredRetrievalMode: primaryEntity?.entityKind === "variant" ? "variant_lookup" : "direct_entity_lookup",
          queryStatus: "not_applicable",
          standaloneQuery: null,
          presentedListTarget: ordinalResolution.presentedListTarget,
          referencedEntities: ordinalResolution.referencedEntities,
          primaryEntityId: primaryEntity?.entityId ?? null,
          resolutionConfidence: "high",
          clarificationRequired: false,
          clarification: null,
        }),
        shadowCandidateFamily: null,
      };
    }
  }

  if (variantDescriptor) {
    for (const context of contexts) {
      if (!context.usableForBinding) {
        continue;
      }

      const variantEntity = resolveVariantDescriptorFromContext(context, variantDescriptor);
      if (variantEntity) {
        const referencedEntities = [
          variantEntity,
          ...(contexts.find((candidate) => candidate.source === "current_focus")
            ?.referencedEntities.filter((entity) => entity.entityKind === "product") ?? []),
        ];
        return {
          resolvedTurn: createResolvedTurn(input, context, {
            resolvedIntent: "entity_followup",
            preferredRetrievalMode: "variant_lookup",
            queryStatus: "not_applicable",
            standaloneQuery: null,
            presentedListTarget: null,
            referencedEntities,
            primaryEntityId: variantEntity.entityId,
            resolutionConfidence: "high",
            clarificationRequired: false,
            clarification: null,
          }),
          shadowCandidateFamily: {
            source: context.source,
            familyKind: "variant",
            entityIds: context.presentedList?.items.map((item) => item.entityId) ?? [],
          },
        };
      }

      if (context.presentedList?.kind === "variant") {
        return {
          resolvedTurn: buildClarificationTurn({
            rawInboundText: input.rawInboundText,
            normalizedInboundText,
            language,
            selectedResolutionSource: context.source,
            resolutionConfidence: "low",
            clarificationReason: "low_confidence_resolution",
            clarificationTarget: "entity",
            promptStrategy: "ask_for_name",
            provenance: makeProvenance(context, contexts, []),
          }),
          shadowCandidateFamily: {
            source: context.source,
            familyKind: "variant",
            entityIds: context.presentedList.items.map((item) => item.entityId),
          },
        };
      }
    }
  }

  const quotedContext = contexts.find((context) => context.source === "quoted_reference");
  if (
    quotedContext
    && isReferentialFollowUp(normalizedInboundText)
    && !hasValidReferencedEntityAnchor(quotedContext.referencedEntities, quotedContext.presentedList)
  ) {
    return {
      resolvedTurn: buildClarificationTurn({
        rawInboundText: input.rawInboundText,
        normalizedInboundText,
        language,
        selectedResolutionSource: "quoted_reference",
        resolutionConfidence: "low",
        clarificationReason: "referenced_entity_invalid",
        clarificationTarget: "entity",
        promptStrategy: "ask_for_name",
        provenance: makeProvenance(quotedContext, contexts, []),
      }),
      shadowCandidateFamily: null,
    };
  }

  if (isImageRequest(normalizedInboundText) || isPriceQuestion(normalizedInboundText)) {
    const preferredRetrievalMode = isImageRequest(normalizedInboundText)
      ? ((entityKind: TurnReferencedEntity["entityKind"]) => entityKind === "variant" ? "variant_lookup" : "direct_entity_lookup")
      : (() => "direct_entity_lookup" as const);

    for (const context of contexts) {
      if (!context.usableForBinding) {
        continue;
      }

      const singleReferencedEntity = getSingleReferencedEntity(context.referencedEntities);
      if (singleReferencedEntity) {
        return {
          resolvedTurn: createResolvedTurn(input, context, {
            resolvedIntent: isImageRequest(normalizedInboundText) ? "image_request" : "entity_followup",
            preferredRetrievalMode: preferredRetrievalMode(singleReferencedEntity.entityKind),
            queryStatus: "not_applicable",
            standaloneQuery: null,
            presentedListTarget: null,
            referencedEntities: [singleReferencedEntity],
            primaryEntityId: singleReferencedEntity.entityId,
            resolutionConfidence: "high",
            clarificationRequired: false,
            clarification: null,
          }),
          shadowCandidateFamily: null,
        };
      }

      if (context.referencedEntities.length > 1) {
        return {
          resolvedTurn: buildClarificationTurn({
            rawInboundText: input.rawInboundText,
            normalizedInboundText,
            language,
            selectedResolutionSource: context.source,
            resolutionConfidence: "low",
            clarificationReason: "ambiguous_referent",
            clarificationTarget: "referent",
            promptStrategy: "ask_for_name",
            referencedEntities: context.referencedEntities,
            provenance: makeProvenance(context, contexts, context.referencedEntities),
          }),
          shadowCandidateFamily: null,
        };
      }
    }
  }

  if (isReferentialFollowUp(normalizedInboundText)) {
    for (const context of contexts) {
      if (!context.usableForBinding) {
        continue;
      }

      const singleReferencedEntity = getSingleReferencedEntity(context.referencedEntities);
      if (singleReferencedEntity) {
        const seedText = selectSeedText(input, context);
        if (!seedText) {
          continue;
        }

        const standaloneQuery = rewriteSemanticFollowUpQuery(normalizedInboundText, language, seedText);
        return {
          resolvedTurn: createResolvedTurn(input, context, {
            resolvedIntent: "entity_followup",
            preferredRetrievalMode: "semantic_catalog_search",
            queryStatus: normalizeTurnResolutionTextForMatch(standaloneQuery) === normalizeTurnResolutionTextForMatch(normalizedInboundText)
              ? "resolved_passthrough"
              : "rewritten",
            standaloneQuery,
            passthroughReason: normalizeTurnResolutionTextForMatch(standaloneQuery)
              === normalizeTurnResolutionTextForMatch(normalizedInboundText)
              ? "no_safe_rewrite_needed"
              : undefined,
            presentedListTarget: null,
            referencedEntities: [singleReferencedEntity],
            primaryEntityId: singleReferencedEntity.entityId,
            resolutionConfidence: context.source === "recent_turns" ? "medium" : "high",
            clarificationRequired: false,
            clarification: null,
          }),
          shadowCandidateFamily: null,
        };
      }

      if (context.referencedEntities.length > 1) {
        return {
          resolvedTurn: buildClarificationTurn({
            rawInboundText: input.rawInboundText,
            normalizedInboundText,
            language,
            selectedResolutionSource: context.source,
            resolutionConfidence: "low",
            clarificationReason: "ambiguous_referent",
            clarificationTarget: "referent",
            promptStrategy: "ask_for_name",
            referencedEntities: context.referencedEntities,
            provenance: makeProvenance(context, contexts, context.referencedEntities),
          }),
          shadowCandidateFamily: null,
        };
      }
    }

    const variantFamilyContext = contexts.find((context) =>
      context.usableForBinding && context.presentedList?.kind === "variant"
    );
    if (variantFamilyContext?.presentedList) {
      return {
        resolvedTurn: buildClarificationTurn({
          rawInboundText: input.rawInboundText,
          normalizedInboundText,
          language,
          selectedResolutionSource: variantFamilyContext.source,
          resolutionConfidence: "low",
          clarificationReason: "low_confidence_resolution",
          clarificationTarget: "entity",
          promptStrategy: "ask_for_name",
          provenance: makeProvenance(variantFamilyContext, contexts, []),
        }),
        shadowCandidateFamily: {
          source: variantFamilyContext.source,
          familyKind: "variant",
          entityIds: variantFamilyContext.presentedList.items.map((item) => item.entityId),
        },
      };
    }

    const summaryContext = contexts.find((context) => context.source === "summary");
    if (summaryContext?.usableForBinding && !isFreshCanonicalContext(input)) {
      return {
        resolvedTurn: buildClarificationTurn({
          rawInboundText: input.rawInboundText,
          normalizedInboundText,
          language,
          selectedResolutionSource: "summary",
          resolutionConfidence: "low",
          clarificationReason: "stale_context_without_anchor",
          clarificationTarget: "user_restatement",
          promptStrategy: "ask_to_restate",
          provenance: makeProvenance(summaryContext, contexts, []),
        }),
        shadowCandidateFamily: null,
      };
    }

    return {
      resolvedTurn: buildClarificationTurn({
        rawInboundText: input.rawInboundText,
        normalizedInboundText,
        language,
        selectedResolutionSource: "raw_text",
        resolutionConfidence: "low",
        clarificationReason: "missing_required_entity",
        clarificationTarget: "entity",
        promptStrategy: "ask_for_name",
        provenance: {
          selectedSources: [buildRawTextProvenance()],
          supportingSources: [],
          conflictingSources: [],
          discardedSources: contexts.filter((context) => !context.usableForBinding).map((context) => context.provenance),
        },
      }),
      shadowCandidateFamily: null,
    };
  }

  if (isStandaloneCatalogSearch(normalizedInboundText)) {
    const summaryContext = contexts.find((context) => context.source === "summary");
    return {
      resolvedTurn: finalizeResolvedTurn({
        rawInboundText: input.rawInboundText,
        normalizedInboundText,
        resolvedIntent: "catalog_search",
        preferredRetrievalMode: "semantic_catalog_search",
        queryStatus: "resolved_passthrough",
        standaloneQuery: normalizedInboundText,
        passthroughReason: "already_standalone",
        presentedListTarget: null,
        referencedEntities: [],
        primaryEntityId: null,
        resolutionConfidence: "high",
        clarificationRequired: false,
        clarification: null,
        selectedResolutionSource: "raw_text",
        provenance: {
          selectedSources: [buildRawTextProvenance()],
          supportingSources: summaryContext ? [summaryContext.provenance] : [],
          conflictingSources: [],
          discardedSources: contexts.filter((context) => !context.usableForBinding).map((context) => context.provenance),
        },
        language,
      }, input),
      shadowCandidateFamily: null,
    };
  }

  return {
    resolvedTurn: finalizeResolvedTurn({
      rawInboundText: input.rawInboundText,
      normalizedInboundText,
      resolvedIntent: "non_catalog_or_unsupported",
      preferredRetrievalMode: "skip_retrieval",
      queryStatus: "not_applicable",
      standaloneQuery: null,
      presentedListTarget: null,
      referencedEntities: [],
      primaryEntityId: null,
      resolutionConfidence: "high",
      clarificationRequired: false,
      clarification: null,
      selectedResolutionSource: "raw_text",
      provenance: {
        selectedSources: [buildRawTextProvenance()],
        supportingSources: [],
        conflictingSources: [],
        discardedSources: contexts.filter((context) => !context.usableForBinding).map((context) => context.provenance),
      },
      language,
    }, input),
    shadowCandidateFamily: null,
  };
};
