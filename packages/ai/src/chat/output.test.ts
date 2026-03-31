import { describe, expect, test } from 'bun:test';
import { parseAssistantStructuredOutput } from './output';

describe("parseAssistantStructuredOutput", () => {
  test("accepts valid minimal v1 structured output", () => {
    expect(
      parseAssistantStructuredOutput(
        '{"schemaVersion":"v1","text":"  We have burger boxes available.  ","action":{"type":"none"}}',
      ),
    ).toEqual({
      ok: true,
      value: {
        schemaVersion: "v1",
        text: "We have burger boxes available.",
        action: {
          type: "none",
        },
      },
    });
  });

  test("returns invalid_json for malformed JSON", () => {
    const result = parseAssistantStructuredOutput("{");

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a parse failure");
    }

    expect(result.error.kind).toBe("invalid_json");
    expect(result.error.message).toBe("Assistant structured output must be valid JSON");
  });

  test("returns invalid_payload_shape for non-object payloads", () => {
    const result = parseAssistantStructuredOutput('["not","an","object"]');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a parse failure");
    }

    expect(result.error.kind).toBe("invalid_payload_shape");
  });

  test("returns invalid_schema_version for unexpected schema versions", () => {
    const result = parseAssistantStructuredOutput(
      '{"schemaVersion":"v2","text":"Hello","action":{"type":"none"}}',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a parse failure");
    }

    expect(result.error.kind).toBe("invalid_schema_version");
  });

  test("returns invalid_text for missing or blank text", () => {
    const result = parseAssistantStructuredOutput(
      '{"schemaVersion":"v1","text":"   ","action":{"type":"clarify"}}',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a parse failure");
    }

    expect(result.error.kind).toBe("invalid_text");
  });

  test("respects narrowed allowedActions", () => {
    expect(
      parseAssistantStructuredOutput(
        '{"schemaVersion":"v1","text":"Can you clarify which size you need?","action":{"type":"clarify"}}',
        {
          allowedActions: ["clarify"],
        },
      ),
    ).toEqual({
      ok: true,
      value: {
        schemaVersion: "v1",
        text: "Can you clarify which size you need?",
        action: {
          type: "clarify",
        },
      },
    });

    const disallowedResult = parseAssistantStructuredOutput(
      '{"schemaVersion":"v1","text":"Connecting you to a person.","action":{"type":"handoff"}}',
      {
        allowedActions: ["clarify"],
      },
    );

    expect(disallowedResult.ok).toBe(false);
    if (disallowedResult.ok) {
      throw new Error("expected a parse failure");
    }

    expect(disallowedResult.error.kind).toBe("invalid_action");
  });
});
