import type { ConversationSessionLogWriter } from "@cs/core";

export type AssistantHandoffSource =
  | "assistant_action"
  | "provider_failure_fallback"
  | "invalid_model_output_fallback";

export const isAssistantHandoffSource = (value: string): value is AssistantHandoffSource =>
  value === "assistant_action"
  || value === "provider_failure_fallback"
  || value === "invalid_model_output_fallback";

const appendPendingAssistantSessionLog = async (
  log: ConversationSessionLogWriter | undefined,
  input: {
    companyId: string;
    conversationId: string;
    details: string;
    event: string;
    timestamp: number;
  },
): Promise<void> => {
  if (!log) {
    return;
  }

  try {
    await log.append({
      kind: "bts",
      timestamp: input.timestamp,
      companyId: input.companyId,
      conversationId: input.conversationId,
      event: input.event,
      details: input.details,
    });
  } catch {
    // Session log is best-effort debugging telemetry; never block reconciliation side effects.
  }
};

export const appendAssistantReconciledSessionLog = (
  log: ConversationSessionLogWriter | undefined,
  input: {
    companyId: string;
    conversationId: string;
    timestamp: number;
  },
): Promise<void> =>
  appendPendingAssistantSessionLog(log, {
    ...input,
    event: "assistant.reconciled",
    details: "Pending assistant message committed by worker reconciliation",
  });

export const appendAssistantAnalyticsReplayedSessionLog = (
  log: ConversationSessionLogWriter | undefined,
  input: {
    companyId: string;
    conversationId: string;
    timestamp: number;
  },
): Promise<void> =>
  appendPendingAssistantSessionLog(log, {
    ...input,
    event: "assistant.analytics_replayed",
    details: "Handoff analytics recorded by worker reconciliation",
  });

export const appendAssistantOwnerNotificationReplayedSessionLog = (
  log: ConversationSessionLogWriter | undefined,
  input: {
    companyId: string;
    conversationId: string;
    timestamp: number;
  },
): Promise<void> =>
  appendPendingAssistantSessionLog(log, {
    ...input,
    event: "assistant.owner_notification_replayed",
    details: "Owner handoff notification replayed by worker reconciliation",
  });
