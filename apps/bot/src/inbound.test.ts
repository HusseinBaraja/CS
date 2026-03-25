import { describe, expect, test } from 'bun:test';
import type { BaileysEventMap, WAMessage } from '@whiskeysockets/baileys';
import type { CompanyRuntimeProfile } from '@cs/shared';
import { normalizeInboundMessages } from './inbound';

const createProfile = (overrides: Partial<CompanyRuntimeProfile> = {}): CompanyRuntimeProfile => ({
  companyId: "company-1",
  name: "Alpha Packaging",
  ownerPhone: "966500000001",
  timezone: "UTC",
  sessionKey: "company-company-1",
  ...overrides,
});

const createMessage = (
  overrides: Partial<WAMessage> = {},
): WAMessage => ({
  key: {
    id: "message-1",
    remoteJid: "967700000001@s.whatsapp.net",
    fromMe: false,
  },
  messageTimestamp: 1_700_000_000,
  message: {
    conversation: "Hello there",
  },
  ...overrides,
} as WAMessage);

const normalizeSingle = (
  event: BaileysEventMap["messages.upsert"],
  profile: CompanyRuntimeProfile = createProfile(),
) => normalizeInboundMessages(profile, event)[0];

describe("normalizeInboundMessages", () => {
  test("normalizes plain conversation text", () => {
    const result = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          message: {
            conversation: "  Hello\r\nworld  ",
          },
        }),
      ],
    });

    expect(result).toEqual({
      kind: "dispatch",
      route: "customer_conversation",
      message: {
        transport: "whatsapp",
        companyId: "company-1",
        sessionKey: "company-company-1",
        messageId: "message-1",
        occurredAtMs: 1_700_000_000_000,
        conversationPhoneNumber: "967700000001",
        sender: {
          phoneNumber: "967700000001",
          transportId: "967700000001@s.whatsapp.net",
          role: "customer",
        },
        content: {
          kind: "text",
          text: "Hello\nworld",
          hasMedia: false,
        },
        source: {
          upsertType: "notify",
        },
      },
    });
  });

  test("normalizes extended text and wrapped text payloads identically", () => {
    const direct = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          message: {
            extendedTextMessage: {
              text: "Need pricing",
            },
          },
        }),
      ],
    });
    const wrapped = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          message: {
            ephemeralMessage: {
              message: {
                viewOnceMessageV2: {
                  message: {
                    extendedTextMessage: {
                      text: "Need pricing",
                    },
                  },
                },
              },
            },
          },
        }),
      ],
    });

    expect(wrapped).toEqual(direct);
  });

  test("extracts quoted reply metadata from text messages", () => {
    const result = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          message: {
            extendedTextMessage: {
              text: "Need pricing",
              contextInfo: {
                stanzaId: "quoted-message-1",
              },
            },
          },
        }),
      ],
    });

    expect(result).toMatchObject({
      kind: "dispatch",
      message: {
        replyContext: {
          referencedMessageId: "quoted-message-1",
        },
      },
    });
  });

  test("normalizes media messages into placeholders and keeps captions when present", () => {
    const imageResult = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          message: {
            imageMessage: {
              caption: "  Product photo ",
            },
          },
        }),
      ],
    });
    const stickerResult = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          key: {
            id: "message-2",
            remoteJid: "967700000002@s.whatsapp.net",
            fromMe: false,
          },
          message: {
            stickerMessage: {},
          },
        }),
      ],
    });

    expect(imageResult).toMatchObject({
      kind: "dispatch",
      route: "customer_conversation",
      message: {
        content: {
          kind: "image",
          text: "Product photo",
          hasMedia: true,
        },
      },
    });
    expect(stickerResult).toMatchObject({
      kind: "dispatch",
      route: "customer_conversation",
      message: {
        content: {
          kind: "sticker",
          text: "",
          hasMedia: true,
        },
      },
    });
    const quotedImageResult = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          key: {
            id: "message-3",
            remoteJid: "967700000003@s.whatsapp.net",
            fromMe: false,
          },
          message: {
            imageMessage: {
              caption: "Photo",
              contextInfo: {
                stanzaId: "quoted-image-1",
              },
            },
          },
        }),
      ],
    });

    expect(quotedImageResult).toMatchObject({
      kind: "dispatch",
      message: {
        replyContext: {
          referencedMessageId: "quoted-image-1",
        },
      },
    });
    if (stickerResult.kind !== "dispatch") {
      throw new Error("expected sticker result to dispatch");
    }
    expect(stickerResult.message).not.toHaveProperty("replyContext");
  });

  test("detects owner commands before customer conversation routing", () => {
    const ownerProfile = createProfile({
      ownerPhone: "+966 500 000 001",
    });
    const ownerCommand = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          key: {
            id: "message-owner-command",
            remoteJid: "966500000001@s.whatsapp.net",
            fromMe: false,
          },
          message: {
            conversation: "  !status  ",
          },
        }),
      ],
    }, ownerProfile);
    const ownerPlainText = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          key: {
            id: "message-owner-plain",
            remoteJid: "966500000001@s.whatsapp.net",
            fromMe: false,
          },
          message: {
            conversation: "hello team",
          },
        }),
      ],
    }, ownerProfile);
    const customerCommandLike = normalizeSingle({
      type: "notify",
      messages: [
        createMessage({
          message: {
            conversation: "!status",
          },
        }),
      ],
    }, ownerProfile);

    expect(ownerCommand).toMatchObject({
      kind: "dispatch",
      route: "owner_command",
      message: {
        sender: {
          role: "owner",
        },
        content: {
          kind: "text",
          text: "!status",
        },
      },
    });
    expect(ownerPlainText).toMatchObject({
      kind: "dispatch",
      route: "customer_conversation",
      message: {
        sender: {
          role: "owner",
        },
      },
    });
    expect(customerCommandLike).toMatchObject({
      kind: "dispatch",
      route: "customer_conversation",
      message: {
        sender: {
          role: "customer",
        },
      },
    });
  });

  test("ignores append upserts, transport noise, malformed payloads, and unsupported types", () => {
    const results = normalizeInboundMessages(createProfile(), {
      type: "append",
      messages: [
        createMessage(),
        createMessage({
          key: {
            id: "from-me",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: true,
          },
        }),
        createMessage({
          key: {
            id: "group",
            remoteJid: "12345@g.us",
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: "broadcast",
            remoteJid: "updates@broadcast",
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: "status",
            remoteJid: "status@broadcast",
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: "newsletter",
            remoteJid: "120363200000000000@newsletter",
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: undefined,
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: "missing-jid",
            remoteJid: undefined,
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: "missing-sender",
            remoteJid: "@s.whatsapp.net",
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: "missing-timestamp",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          messageTimestamp: undefined,
        }),
        createMessage({
          key: {
            id: "empty-payload",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          message: undefined,
        }),
        createMessage({
          key: {
            id: "unsupported",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          message: {
            locationMessage: {},
          },
        }),
      ],
    });

    expect(results.map((result) => result.kind === "ignored" ? result.event.reason : "dispatch")).toEqual([
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
      "history_sync_append",
    ]);
  });

  test("reports non-append ignore reasons explicitly", () => {
    const results = normalizeInboundMessages(createProfile(), {
      type: "notify",
      messages: [
        createMessage({
          key: {
            id: "from-me",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: true,
          },
        }),
        createMessage({
          key: {
            id: undefined,
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
        }),
        createMessage({
          key: {
            id: "unsupported",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
          message: {
            locationMessage: {},
          },
        }),
      ],
    });

    expect(results).toEqual([
      {
        kind: "ignored",
        event: {
          transport: "whatsapp",
          companyId: "company-1",
          sessionKey: "company-company-1",
          reason: "from_me",
          source: {
            upsertType: "notify",
            rawMessageId: "from-me",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: true,
          },
        },
      },
      {
        kind: "ignored",
        event: {
          transport: "whatsapp",
          companyId: "company-1",
          sessionKey: "company-company-1",
          reason: "missing_message_id",
          source: {
            upsertType: "notify",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
        },
      },
      {
        kind: "ignored",
        event: {
          transport: "whatsapp",
          companyId: "company-1",
          sessionKey: "company-company-1",
          reason: "unsupported_message_type",
          source: {
            upsertType: "notify",
            rawMessageId: "unsupported",
            remoteJid: "967700000001@s.whatsapp.net",
            fromMe: false,
          },
        },
      },
    ]);
  });
});
