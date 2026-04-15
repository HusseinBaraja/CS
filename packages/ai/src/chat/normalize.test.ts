import { describe, expect, test } from 'bun:test';
import { normalizeChatRequest } from './normalize';

describe("normalizeChatRequest", () => {
  test("normalizes string content into one text part", () => {
    const normalized = normalizeChatRequest({
      messages: [
        {
          role: "user",
          content: "Hello",
          name: "customer",
        },
      ],
      temperature: 0.2,
    });

    expect(normalized).toEqual({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
          name: "customer",
        },
      ],
      temperature: 0.2,
    });
  });

  test("preserves array content", () => {
    const parts = [{ type: "text" as const, text: "مرحبا" }];

    const normalized = normalizeChatRequest({
      messages: [
        {
          role: "assistant",
          content: parts,
        },
      ],
    });

    expect(normalized.messages[0]?.content).toEqual(parts);
  });

  test("preserves responseFormat metadata", () => {
    const normalized = normalizeChatRequest({
      messages: [
        {
          role: "user",
          content: "Hello",
        },
      ],
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "rewrite_result",
          strict: true,
          schema: {
            type: "object",
          },
        },
      },
    });

    expect(normalized.responseFormat).toEqual({
      type: "json_schema",
      jsonSchema: {
        name: "rewrite_result",
        strict: true,
        schema: {
          type: "object",
        },
      },
    });
  });

  test("rejects empty message arrays", () => {
    expect(() => normalizeChatRequest({ messages: [] })).toThrow(
      "Chat requests require at least one message",
    );
  });

  test("rejects whitespace-only content", () => {
    expect(() =>
      normalizeChatRequest({
        messages: [
          {
            role: "user",
            content: "   ",
          },
        ],
      })
    ).toThrow("Chat messages require non-empty text content");
  });

  test("rejects empty content arrays", () => {
    expect(() =>
      normalizeChatRequest({
        messages: [
          {
            role: "system",
            content: [],
          },
        ],
      })
    ).toThrow("Chat messages require at least one content part");
  });
});
