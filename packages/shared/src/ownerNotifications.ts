import type { ConversationMessageDto } from './conversations';

export const formatOwnerNotification = (
  input: {
    companyName: string;
    customerPhoneNumber: string;
    history: ConversationMessageDto[];
    source: "assistant_action" | "provider_failure_fallback" | "invalid_model_output_fallback" | "message_too_long";
  },
): string => {
  const sourceLabel =
    input.source === "assistant_action"
      ? "assistant handoff action"
      : input.source === "provider_failure_fallback"
        ? "provider failure fallback"
        : input.source === "invalid_model_output_fallback"
          ? "invalid model output fallback"
          : "raw inbound text exceeded the configured automation threshold";

  const historyLines = input.history.length === 0
    ? ["- No prior conversation history available"]
    : input.history.map((entry) => `- ${entry.role === "user" ? "Customer" : "Assistant"}: ${entry.content}`);

  return [
    `Handoff started for ${input.companyName}.`,
    `Customer: ${input.customerPhoneNumber}`,
    `Trigger: ${sourceLabel}`,
    "Auto-resume: 12 hours after the customer's last message while muted.",
    "Recent conversation:",
    ...historyLines,
  ].join("\n");
};
