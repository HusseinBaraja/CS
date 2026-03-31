import type {
  AssistantActionType,
  ParseAssistantStructuredOutputResult,
  ParseAssistantStructuredOutputOptions,
} from './promptContracts';
import { StructuredOutputParseError } from './promptContracts';
import { getAllowedActions } from './actions';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseAssistantStructuredOutput = (
  raw: string,
  options: ParseAssistantStructuredOutputOptions = {},
): ParseAssistantStructuredOutputResult => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: new StructuredOutputParseError(
        "invalid_json",
        "Assistant structured output must be valid JSON",
        { cause: error },
      ),
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: new StructuredOutputParseError(
        "invalid_payload_shape",
        "Assistant structured output must be a JSON object",
      ),
    };
  }

  if (parsed.schemaVersion !== "v1") {
    return {
      ok: false,
      error: new StructuredOutputParseError(
        "invalid_schema_version",
        'Assistant structured output schemaVersion must be "v1"',
      ),
    };
  }

  if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
    return {
      ok: false,
      error: new StructuredOutputParseError(
        "invalid_text",
        "Assistant structured output text must be a non-empty string",
      ),
    };
  }

  if (!isRecord(parsed.action)) {
    return {
      ok: false,
      error: new StructuredOutputParseError(
        "invalid_payload_shape",
        "Assistant structured output action must be an object",
      ),
    };
  }

  const allowedActions = getAllowedActions(options?.allowedActions);
  if (
    typeof parsed.action.type !== "string" ||
    !allowedActions.includes(parsed.action.type as AssistantActionType)
  ) {
    return {
      ok: false,
      error: new StructuredOutputParseError(
        "invalid_action",
        `Assistant structured output action.type must be one of: ${allowedActions.join(", ")}`,
      ),
    };
  }

  return {
    ok: true,
    value: {
      schemaVersion: "v1",
      text: parsed.text.trim(),
      action: {
        type: parsed.action.type as AssistantActionType,
      },
    },
  };
};
