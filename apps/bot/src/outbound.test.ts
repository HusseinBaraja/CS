import { describe, expect, test } from 'bun:test';
import {
  classifyOutboundError,
  computeTypingDurationMs,
  createOutboundMessenger,
  OutboundMediaResolutionError,
  OutboundSequenceError,
  OutboundTransportUnavailableError,
  OutboundValidationError,
  type OutboundTransport,
} from './outbound';

const createLoggerStub = () => {
  const errorCalls: Array<{ payload: unknown; message: string }> = [];

  return {
    logger: {
      error: (payload: unknown, message: string) => {
        errorCalls.push({ payload, message });
      },
    },
    errorCalls,
  };
};

const createTransportStub = (
  overrides: Partial<OutboundTransport> = {},
): OutboundTransport & {
  events: string[];
  sendCalls: Array<{ recipientJid: string; message: unknown }>;
} => {
  const events: string[] = [];
  const sendCalls: Array<{ recipientJid: string; message: unknown }> = [];

  return {
    async presenceSubscribe(recipientJid) {
      events.push(`presence:subscribe:${recipientJid}`);
      await overrides.presenceSubscribe?.(recipientJid);
    },
    async sendMessage(recipientJid, message) {
      events.push(`send:${recipientJid}`);
      sendCalls.push({ recipientJid, message });
      return overrides.sendMessage
        ? overrides.sendMessage(recipientJid, message)
        : { key: { id: `message-${sendCalls.length}` } };
    },
    async sendPresenceUpdate(state, recipientJid) {
      events.push(`presence:${state}:${recipientJid}`);
      await overrides.sendPresenceUpdate?.(state, recipientJid);
    },
    events,
    sendCalls,
  };
};

const createTimerStub = () => {
  const scheduled: number[] = [];

  return {
    timer: {
      setTimeout: (handler: () => void, delayMs: number) => {
        scheduled.push(delayMs);
        handler();
        return scheduled.length;
      },
      clearTimeout: () => undefined,
    },
    scheduled,
  };
};

describe("computeTypingDurationMs", () => {
  test("returns the auto minimum for short text", () => {
    expect(computeTypingDurationMs({
      text: "Hello",
      typing: "auto",
    })).toBe(600);
  });

  test("returns the auto maximum for long text", () => {
    expect(computeTypingDurationMs({
      text: "x".repeat(500),
      typing: "auto",
    })).toBe(2_500);
  });

  test("uses 900ms for captionless media when typing is explicitly requested", () => {
    expect(computeTypingDurationMs({
      typing: "auto",
    })).toBe(900);
  });

  test("supports explicit typing durations and off", () => {
    expect(computeTypingDurationMs({
      text: "Hello",
      typing: 1_200,
    })).toBe(1_200);
    expect(computeTypingDurationMs({
      text: "Hello",
      typing: "off",
    })).toBe(0);
  });
});

describe("classifyOutboundError", () => {
  test("classifies validation and media resolution failures without retries", () => {
    expect(classifyOutboundError(new OutboundValidationError("bad text"))).toEqual({
      classification: "validation",
      retryable: false,
    });
    expect(classifyOutboundError(new OutboundMediaResolutionError("missing media"))).toEqual({
      classification: "media_resolution",
      retryable: false,
    });
  });

  test("classifies retryable transport failures from status codes and error codes", () => {
    expect(classifyOutboundError({ output: { statusCode: 503 } })).toEqual({
      classification: "retryable_transport",
      retryable: true,
      statusCode: 503,
    });
    expect(classifyOutboundError({ code: "ETIMEDOUT" })).toEqual({
      classification: "retryable_transport",
      retryable: true,
      code: "ETIMEDOUT",
    });
  });

  test("classifies unavailable transport and unknown failures as non-retryable", () => {
    expect(classifyOutboundError(new OutboundTransportUnavailableError("closed"))).toEqual({
      classification: "non_retryable_transport",
      retryable: false,
    });
    expect(classifyOutboundError(new Error("mystery"))).toEqual({
      classification: "unknown",
      retryable: false,
    });
  });
});

describe("createOutboundMessenger", () => {
  test("sends rendered text through the stable messenger interface", async () => {
    const transport = createTransportStub();
    const outbound = createOutboundMessenger({
      transport,
    });

    const receipts = await outbound.sendText({
      recipientJid: "967700000001@s.whatsapp.net",
      text: {
        sections: [
          "  Hello  ",
          ["  world  "],
        ],
      },
    });

    expect(receipts).toEqual([
      {
        attempts: 1,
        kind: "text",
        messageId: "message-1",
        recipientJid: "967700000001@s.whatsapp.net",
        stepIndex: 0,
      },
    ]);
    expect(transport.sendCalls).toEqual([
      {
        recipientJid: "967700000001@s.whatsapp.net",
        message: {
          text: "Hello\n\nworld",
        },
      },
    ]);
  });

  test("resolves storage-backed media lazily and sends image captions", async () => {
    const transport = createTransportStub();
    const outbound = createOutboundMessenger({
      transport,
      createStorage: () => ({
        createPresignedDownload: async (request) => ({
          url: `https://cdn.example.com/${request.key}`,
          expiresAt: "2026-03-17T00:00:00.000Z",
        }),
        createPresignedUpload: async () => {
          throw new Error("not implemented");
        },
        deleteObject: async () => undefined,
        statObject: async () => null,
      }),
    });

    await outbound.sendMedia({
      recipientJid: "967700000002@s.whatsapp.net",
      step: {
        kind: "image",
        media: {
          type: "storage_key",
          key: "companies/company-1/products/product-1/image-1.jpg",
        },
        caption: {
          sections: [
            "  Product photo  ",
          ],
        },
      },
    });

    expect(transport.sendCalls[0]).toEqual({
      recipientJid: "967700000002@s.whatsapp.net",
      message: {
        image: {
          url: "https://cdn.example.com/companies/company-1/products/product-1/image-1.jpg",
        },
        caption: "Product photo",
      },
    });
  });

  test("supports document media sends with direct urls and filenames", async () => {
    const transport = createTransportStub();
    const outbound = createOutboundMessenger({
      transport,
    });

    await outbound.sendMedia({
      recipientJid: "967700000003@s.whatsapp.net",
      step: {
        kind: "document",
        media: {
          type: "url",
          url: "https://example.com/catalog.pdf",
        },
        caption: "  Catalog  ",
        fileName: "catalog.pdf",
        mimeType: "application/pdf",
      },
    });

    expect(transport.sendCalls[0]).toEqual({
      recipientJid: "967700000003@s.whatsapp.net",
      message: {
        document: {
          url: "https://example.com/catalog.pdf",
        },
        caption: "Catalog",
        fileName: "catalog.pdf",
        mimetype: "application/pdf",
      },
    });
  });

  test("applies pre-send delays, typing indicators, and between-step delays in sequence order", async () => {
    const transport = createTransportStub();
    const { timer, scheduled } = createTimerStub();
    const outbound = createOutboundMessenger({
      transport,
      timer,
    });

    await outbound.sendSequence({
      recipientJid: "967700000004@s.whatsapp.net",
      betweenStepsDelayMs: 300,
      steps: [
        {
          kind: "text",
          text: "Hello",
          pacing: {
            delayBeforeMs: 150,
            typing: "auto",
          },
        },
        {
          kind: "image",
          media: {
            type: "url",
            url: "https://example.com/image.jpg",
          },
          pacing: {
            typing: 1_100,
          },
        },
      ],
    });

    expect(scheduled).toEqual([150, 600, 300, 1_100]);
    expect(transport.events).toEqual([
      "presence:subscribe:967700000004@s.whatsapp.net",
      "presence:composing:967700000004@s.whatsapp.net",
      "presence:paused:967700000004@s.whatsapp.net",
      "send:967700000004@s.whatsapp.net",
      "presence:subscribe:967700000004@s.whatsapp.net",
      "presence:composing:967700000004@s.whatsapp.net",
      "presence:paused:967700000004@s.whatsapp.net",
      "send:967700000004@s.whatsapp.net",
    ]);
  });

  test("retries retryable transport failures exactly once and stops the sequence on the first failed step", async () => {
    const { logger, errorCalls } = createLoggerStub();
    let sendAttempt = 0;
    const transport = createTransportStub({
      async sendMessage(_recipientJid, message) {
        sendAttempt += 1;
        if (typeof message === "object" && message !== null && "text" in message) {
          return { key: { id: "message-1" } };
        }

        throw { code: "ETIMEDOUT" };
      },
    });
    const { timer, scheduled } = createTimerStub();
    const outbound = createOutboundMessenger({
      logger,
      timer,
      transport,
    });

    await expect(outbound.sendSequence({
      recipientJid: "967700000005@s.whatsapp.net",
      steps: [
        {
          kind: "text",
          text: "First",
        },
        {
          kind: "image",
          media: {
            type: "url",
            url: "https://example.com/image.jpg",
          },
        },
        {
          kind: "text",
          text: "never reached",
        },
      ],
    })).rejects.toMatchObject({
      classification: "retryable_transport",
      stepIndex: 1,
      attempts: 2,
      sentReceipts: [
        {
          attempts: 1,
          kind: "text",
          messageId: "message-1",
          recipientJid: "967700000005@s.whatsapp.net",
          stepIndex: 0,
        },
      ],
    });

    expect(sendAttempt).toBe(3);
    expect(scheduled).toEqual([500]);
    expect(errorCalls).toEqual([
      {
        payload: {
          attempts: 2,
          classification: "retryable_transport",
          recipientJid: "967700000005@s.whatsapp.net",
          sentCount: 1,
          stepIndex: 1,
        },
        message: "outbound sequence send failed",
      },
    ]);
  });

  test("does not retry media resolution failures", async () => {
    const transport = createTransportStub();
    const outbound = createOutboundMessenger({
      transport,
      createStorage: () => ({
        createPresignedDownload: async () => {
          throw new Error("storage failed");
        },
        createPresignedUpload: async () => {
          throw new Error("not implemented");
        },
        deleteObject: async () => undefined,
        statObject: async () => null,
      }),
    });

    await expect(outbound.sendMedia({
      recipientJid: "967700000006@s.whatsapp.net",
      step: {
        kind: "image",
        media: {
          type: "storage_key",
          key: "companies/company-1/products/product-1/image-1.jpg",
        },
      },
    })).rejects.toMatchObject({
      classification: "media_resolution",
      attempts: 1,
      stepIndex: 0,
      sentReceipts: [],
    } satisfies Partial<OutboundSequenceError>);

    expect(transport.sendCalls).toEqual([]);
  });
});
