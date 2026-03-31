import type { ConversationEvaluationCase } from "@cs/shared";

const createCase = (
  evaluationCase: ConversationEvaluationCase,
): ConversationEvaluationCase => evaluationCase;

export const step0BaselineCases: ConversationEvaluationCase[] = [
  createCase({
    id: "numbered_followup_ar",
    title: "Arabic numbered follow-up stays tied to the prior list",
    language: "ar",
    conversationHistory: [
      {
        role: "user",
        text: "اعرض لي علب البرجر المتوفرة",
      },
      {
        role: "assistant",
        text: "لدينا خياران: الأولى اقتصادية والثانية كبيرة مع غطاء محكم.",
      },
    ],
    inboundMessage: {
      kind: "text",
      text: "الثاني",
      hasMedia: false,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "الثاني",
        requiresContextResolution: true,
      },
      future: {
        standaloneQuery: "أخبرني عن علبة البرجر الكبيرة مع الغطاء المحكم",
        requiresContextResolution: true,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "low_signal",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "low_signal_reply",
        shouldHandoff: false,
        shouldClarify: false,
      },
      future: {
        shouldHandoff: false,
        shouldClarify: false,
      },
    },
    tags: ["arabic", "follow_up", "referent_resolution", "baseline"],
  }),
  createCase({
    id: "pronoun_followup_en",
    title: "English pronoun follow-up depends on prior product focus",
    language: "en",
    conversationHistory: [
      {
        role: "user",
        text: "Tell me about your burger box",
      },
      {
        role: "assistant",
        text: "Our burger box comes in medium and large sizes.",
      },
    ],
    inboundMessage: {
      kind: "text",
      text: "what sizes does it come in",
      hasMedia: false,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "what sizes does it come in",
        requiresContextResolution: true,
      },
      future: {
        standaloneQuery: "What sizes does the burger box come in?",
        requiresContextResolution: true,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "low_signal",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "low_signal_reply",
        shouldHandoff: false,
        shouldClarify: false,
      },
      future: {
        shouldHandoff: false,
        shouldClarify: false,
      },
    },
    tags: ["english", "pronoun", "follow_up", "baseline"],
  }),
  createCase({
    id: "idle_gap_then_reference",
    title: "Long idle gap follow-up should stay measurable as context-dependent",
    language: "en",
    conversationHistory: [
      {
        role: "user",
        text: "Show me the salad bowl options",
      },
      {
        role: "assistant",
        text: "We have a clear bowl and a kraft bowl.",
      },
    ],
    inboundMessage: {
      kind: "text",
      text: "does the clear one have a lid",
      hasMedia: false,
      idleGapMsBefore: 1000 * 60 * 90,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "does the clear one have a lid",
        requiresContextResolution: true,
      },
      future: {
        standaloneQuery: "Does the clear salad bowl have a lid?",
        requiresContextResolution: true,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "low_signal",
        shouldUseRecentTurns: false,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "low_signal_reply",
        shouldHandoff: false,
        shouldClarify: false,
      },
      future: {
        shouldHandoff: false,
        shouldClarify: false,
      },
    },
    tags: ["idle_gap", "context_loss", "english", "baseline"],
  }),
  createCase({
    id: "low_signal_raw_query_but_contextual_target_exists",
    title: "Weak raw query still has a recoverable contextual target",
    language: "ar",
    conversationHistory: [
      {
        role: "user",
        text: "أرني علب الصوص",
      },
      {
        role: "assistant",
        text: "لدينا علبة صوص دائرية صغيرة وعلبة مستطيلة أكبر.",
      },
    ],
    inboundMessage: {
      kind: "text",
      text: "الكبيرة",
      hasMedia: false,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "الكبيرة",
        requiresContextResolution: true,
      },
      future: {
        standaloneQuery: "أخبرني عن علبة الصوص المستطيلة الكبيرة",
        requiresContextResolution: true,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "low_signal",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "low_signal_reply",
        shouldHandoff: false,
        shouldClarify: false,
      },
      future: {
        shouldHandoff: false,
        shouldClarify: false,
      },
    },
    tags: ["arabic", "low_signal", "recoverable", "baseline"],
  }),
  createCase({
    id: "invalid_model_output_vs_provider_failure",
    title: "Invalid model output and provider failure remain distinct failure classes",
    language: "en",
    conversationHistory: [
      {
        role: "user",
        text: "Do you have portion cups?",
      },
    ],
    inboundMessage: {
      kind: "text",
      text: "show me the small one",
      hasMedia: false,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "show me the small one",
        requiresContextResolution: true,
      },
      future: {
        standaloneQuery: "Show me the small portion cup",
        requiresContextResolution: true,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "handoff",
        shouldHandoff: true,
        shouldClarify: false,
      },
      future: {
        decisionType: "handoff",
        shouldHandoff: true,
        shouldClarify: false,
      },
    },
    tags: ["provider", "parse_failure", "handoff", "baseline"],
  }),
  createCase({
    id: "duplicate_inbound_not_counted",
    title: "Duplicate inbound messages do not count twice in baseline evaluation",
    language: "en",
    conversationHistory: [
      {
        role: "user",
        text: "Do you have paper cups?",
      },
      {
        role: "assistant",
        text: "Yes, we stock several paper cup sizes.",
      },
    ],
    inboundMessage: {
      kind: "text",
      text: "the large one",
      hasMedia: false,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "the large one",
        requiresContextResolution: true,
      },
      future: {
        standaloneQuery: "Tell me about the large paper cup",
        requiresContextResolution: true,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "low_signal",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "low_signal_reply",
        shouldHandoff: false,
        shouldClarify: false,
      },
      future: {
        shouldHandoff: false,
        shouldClarify: false,
      },
    },
    tags: ["dedupe", "metrics", "english", "baseline"],
  }),
  createCase({
    id: "media_only_turn_observable_without_text_metrics_distortion",
    title: "Media-only follow-up stays observable without pretending it has text evidence",
    language: "ar",
    conversationHistory: [
      {
        role: "user",
        text: "أرسل لي صور علب الكيك",
      },
      {
        role: "assistant",
        text: "هذه صور علب الكيك الشفافة.",
      },
    ],
    inboundMessage: {
      kind: "image",
      text: "",
      hasMedia: true,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "",
        requiresContextResolution: false,
      },
      future: {
        standaloneQuery: "",
        requiresContextResolution: false,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "empty",
        shouldUseRecentTurns: false,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "empty",
        shouldUseRecentTurns: false,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "clarify",
        shouldHandoff: false,
        shouldClarify: true,
      },
      future: {
        decisionType: "clarify",
        shouldHandoff: false,
        shouldClarify: true,
      },
    },
    tags: ["media_only", "arabic", "metrics", "baseline"],
  }),
  createCase({
    id: "stale_unquoted_followup_resets_recent_history",
    title: "Stale unquoted follow-up documents the current history reset behavior",
    language: "en",
    conversationHistory: [
      {
        role: "user",
        text: "Tell me about the soup container",
      },
      {
        role: "assistant",
        text: "The soup container comes in 16oz and 32oz.",
      },
    ],
    inboundMessage: {
      kind: "text",
      text: "what about the bigger one",
      hasMedia: false,
      idleGapMsBefore: 1000 * 60 * 180,
    },
    expectedResolvedIntent: {
      current: {
        standaloneQuery: "what about the bigger one",
        requiresContextResolution: true,
      },
      future: {
        standaloneQuery: "Tell me about the 32oz soup container",
        requiresContextResolution: true,
      },
    },
    expectedRetrievalBehavior: {
      current: {
        retrievalMode: "raw_latest_message",
        outcome: "low_signal",
        shouldUseRecentTurns: false,
        shouldUseQuotedReference: false,
      },
      future: {
        retrievalMode: "raw_latest_message",
        outcome: "grounded",
        shouldUseRecentTurns: true,
        shouldUseQuotedReference: false,
      },
    },
    expectedAssistantBehavior: {
      current: {
        decisionType: "low_signal_reply",
        shouldHandoff: false,
        shouldClarify: false,
      },
      future: {
        shouldHandoff: false,
        shouldClarify: false,
      },
    },
    tags: ["stale_history", "reset", "english", "baseline"],
  }),
];

export const getStep0BaselineCaseById = (
  caseId: string,
): ConversationEvaluationCase | undefined =>
  step0BaselineCases.find((evaluationCase) => evaluationCase.id === caseId);
