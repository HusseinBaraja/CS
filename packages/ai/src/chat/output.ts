import type {
  AssistantActionType,
  AssistantStructuredOutput,
  ParseAssistantStructuredOutputOptions,
} from './promptContracts';
import { getAllowedActions } from './actions';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseAssistantStructuredOutput = (
  raw: string,
  options: ParseAssistantStructuredOutputOptions = {},
): AssistantStructuredOutput => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const parseError = new Error("Assistant structured output must be valid JSON");
    Object.defineProperty(parseError, "cause", {
      configurable: true,
      enumerable: false,
      value: error,
      writable: true,
    });
    throw parseError;
  }

  if (!isRecord(parsed)) {
    throw new Error("Assistant structured output must be a JSON object");
  }

  if (parsed.schemaVersion !== "v1") {
    throw new Error('Assistant structured output schemaVersion must be "v1"');
  }

  if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
    throw new Error("Assistant structured output text must be a non-empty string");
  }

  if (!isRecord(parsed.action)) {
    throw new Error("Assistant structured output action must be an object");
  }

  const allowedActions = getAllowedActions(options?.allowedActions);
  if (
    typeof parsed.action.type !== "string" ||
    !allowedActions.includes(parsed.action.type as AssistantActionType)
  ) {
    throw new Error(
      `Assistant structured output action.type must be one of: ${allowedActions.join(", ")}`,
    );
  }

  return {
    schemaVersion: "v1",
    text: parsed.text.trim(),
    action: {
      type: parsed.action.type as AssistantActionType,
    },
  };
};
