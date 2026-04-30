import { getAnalyticsIdempotencyKey } from "./analytics";
import type { ConversationMessageDto, ConversationStateEventSource } from "./conversations";
import { canonicalizePhoneNumber } from "./inbound";
import { formatOwnerNotification } from "./ownerNotifications";

export const OWNER_HANDOFF_HISTORY_LIMIT = 6;

export type PendingHandoffSideEffectState =
  | "pending"
  | "recorded"
  | "sent"
  | "completed"
  | "not_applicable";

export type AssistantHandoffSource = Extract<
  ConversationStateEventSource,
  "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback"
>;

export interface PendingHandoffSideEffectFailure {
  sideEffect: "analytics" | "owner_notification";
  error: unknown;
}

export interface RunPendingHandoffSideEffectsInput {
  companyId: string;
  conversationId: string;
  customerPhoneNumber: string;
  handoffSource?: AssistantHandoffSource;
  pendingMessageId: string;
  timestamp: number;
  analyticsState?: PendingHandoffSideEffectState;
  ownerNotificationState?: PendingHandoffSideEffectState;
  completeAnalytics(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
  }): Promise<void>;
  completeOwnerNotification(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
  }): Promise<void>;
  getOwnerNotificationContext(): Promise<{
    companyName: string;
    ownerPhone: string;
  } | null>;
  listRecentMessages(input: {
    companyId: string;
    conversationId: string;
    limit: number;
  }): Promise<ConversationMessageDto[]>;
  recordAnalytics(input: {
    companyId: string;
    conversationId: string;
    customerPhoneNumber: string;
    handoffSource: AssistantHandoffSource;
    idempotencyKey: string;
    pendingMessageId: string;
    timestamp: number;
  }): Promise<void>;
  recordAnalyticsProgress(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
  }): Promise<void>;
  recordOwnerNotificationProgress(input: {
    companyId: string;
    conversationId: string;
    pendingMessageId: string;
  }): Promise<void>;
  sendOwnerNotification(input: {
    recipientJid: string;
    text: string;
  }): Promise<void>;
}

export interface RunPendingHandoffSideEffectsResult {
  failures: PendingHandoffSideEffectFailure[];
}

const shouldRunAnalytics = (state: PendingHandoffSideEffectState | undefined): boolean =>
  state === "pending" || state === "recorded";

const shouldRunOwnerNotification = (state: PendingHandoffSideEffectState | undefined): boolean =>
  state === "pending" || state === "sent";

const runAnalyticsSideEffect = async (
  input: RunPendingHandoffSideEffectsInput,
): Promise<void> => {
  if (!shouldRunAnalytics(input.analyticsState)) {
    return;
  }

  if (input.analyticsState === "pending") {
    if (!input.handoffSource) {
      throw new Error("Pending assistant analytics requires message.handoffSource");
    }

    await input.recordAnalytics({
      companyId: input.companyId,
      conversationId: input.conversationId,
      customerPhoneNumber: input.customerPhoneNumber,
      handoffSource: input.handoffSource,
      idempotencyKey: getAnalyticsIdempotencyKey(input.pendingMessageId),
      pendingMessageId: input.pendingMessageId,
      timestamp: input.timestamp,
    });
    await input.recordAnalyticsProgress({
      companyId: input.companyId,
      conversationId: input.conversationId,
      pendingMessageId: input.pendingMessageId,
    });
  }

  await input.completeAnalytics({
    companyId: input.companyId,
    conversationId: input.conversationId,
    pendingMessageId: input.pendingMessageId,
  });
};

const runOwnerNotificationSideEffect = async (
  input: RunPendingHandoffSideEffectsInput,
): Promise<void> => {
  if (!shouldRunOwnerNotification(input.ownerNotificationState)) {
    return;
  }

  if (input.ownerNotificationState === "pending") {
    if (!input.handoffSource) {
      throw new Error("Pending assistant owner notification requires message.handoffSource");
    }

    const [ownerContext, recentMessages] = await Promise.all([
      input.getOwnerNotificationContext(),
      input.listRecentMessages({
        companyId: input.companyId,
        conversationId: input.conversationId,
        limit: OWNER_HANDOFF_HISTORY_LIMIT,
      }),
    ]);
    const ownerPhoneNumber = ownerContext ? canonicalizePhoneNumber(ownerContext.ownerPhone) : null;

    if (!ownerContext || !ownerPhoneNumber) {
      throw new Error("Owner notification context unavailable");
    }

    await input.sendOwnerNotification({
      recipientJid: `${ownerPhoneNumber}@s.whatsapp.net`,
      text: formatOwnerNotification({
        companyName: ownerContext.companyName,
        customerPhoneNumber: input.customerPhoneNumber,
        history: recentMessages,
        source: input.handoffSource,
      }),
    });
    await input.recordOwnerNotificationProgress({
      companyId: input.companyId,
      conversationId: input.conversationId,
      pendingMessageId: input.pendingMessageId,
    });
  }

  await input.completeOwnerNotification({
    companyId: input.companyId,
    conversationId: input.conversationId,
    pendingMessageId: input.pendingMessageId,
  });
};

export const runPendingHandoffSideEffects = async (
  input: RunPendingHandoffSideEffectsInput,
): Promise<RunPendingHandoffSideEffectsResult> => {
  const failures: PendingHandoffSideEffectFailure[] = [];

  try {
    await runAnalyticsSideEffect(input);
  } catch (error) {
    failures.push({ sideEffect: "analytics", error });
  }

  try {
    await runOwnerNotificationSideEffect(input);
  } catch (error) {
    failures.push({ sideEffect: "owner_notification", error });
  }

  return { failures };
};
