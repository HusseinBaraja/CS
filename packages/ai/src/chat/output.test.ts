import { describe, expect, test } from 'bun:test';
import { parseAssistantStructuredOutput } from './output';

describe("parseAssistantStructuredOutput", () => {
  test("accepts valid minimal v1 structured output", () => {
    expect(
      parseAssistantStructuredOutput(
        '{"schemaVersion":"v1","text":"  We have burger boxes available.  ","action":{"type":"none"}}',
      ),
    ).toEqual({
      schemaVersion: "v1",
      text: "We have burger boxes available.",
      action: {
        type: "none",
      },
    });
  });

  test("rejects malformed JSON", () => {
    expect(() => parseAssistantStructuredOutput("{")).toThrow(
      "Assistant structured output must be valid JSON",
    );
  });

  test("rejects unknown action types", () => {
    expect(() =>
      parseAssistantStructuredOutput(
        '{"schemaVersion":"v1","text":"Hello","action":{"type":"catalog"}}',
      )
    ).toThrow('Assistant structured output action.type must be one of: none, clarify, handoff');
  });

  test("rejects missing or blank text", () => {
    expect(() =>
      parseAssistantStructuredOutput(
        '{"schemaVersion":"v1","text":"   ","action":{"type":"clarify"}}',
      )
    ).toThrow("Assistant structured output text must be a non-empty string");
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
      schemaVersion: "v1",
      text: "Can you clarify which size you need?",
      action: {
        type: "clarify",
      },
    });

    expect(() =>
      parseAssistantStructuredOutput(
        '{"schemaVersion":"v1","text":"Connecting you to a person.","action":{"type":"handoff"}}',
        {
          allowedActions: ["clarify"],
        },
      )
    ).toThrow('Assistant structured output action.type must be one of: clarify');
  });
});
