export interface ConversationSessionLogNotePayload {
  kind: "note";
  text: string;
}

export interface ConversationSessionLogAiPayload {
  kind: "ai";
  systemPrompt: string;
  groundingContext?: unknown;
  provider: string;
  usage?: unknown;
  apiResult: unknown;
}

export type ConversationSessionLogBackgroundPayload =
  | ConversationSessionLogNotePayload
  | ConversationSessionLogAiPayload;

const stringifyJson = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value ?? null, null, 2);
    return serialized ?? "null";
  } catch {
    return JSON.stringify(String(value), null, 2);
  }
};

const toJsonFenceBlock = (value: unknown): string =>
  [
    "```json",
    stringifyJson(value),
    "```",
  ].join("\n");

export const renderConversationSessionLogBackgroundPayload = (
  payload: ConversationSessionLogBackgroundPayload,
): string => {
  if (payload.kind === "note") {
    return payload.text;
  }

  const sections: string[] = [
    "System Prompt:",
    payload.systemPrompt,
  ];

  if (payload.groundingContext !== undefined) {
    sections.push(
      "",
      "Grounding Context:",
      typeof payload.groundingContext === "string"
        ? payload.groundingContext
        : toJsonFenceBlock(payload.groundingContext),
    );
  }

  sections.push(
    "",
    "Provider:",
    payload.provider,
    "",
    "Usage:",
    toJsonFenceBlock(payload.usage ?? null),
    "",
    "API Result:",
    toJsonFenceBlock(payload.apiResult),
  );

  return sections.join("\n");
};
