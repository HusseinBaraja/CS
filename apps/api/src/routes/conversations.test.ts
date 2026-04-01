import { describe, expect, test } from 'bun:test';
import { ERROR_CODES, type ConversationRecordDto } from '@cs/shared';
import { createApp } from '../app';
import {
  type ConversationsService,
  ConversationsServiceError,
} from '../services/conversations';

const API_KEY = "test-api-key";

const baseConversation: ConversationRecordDto = {
  id: "conversation-1",
  companyId: "company-1",
  phoneNumber: "967700000001",
  muted: false,
};

const authHeaders = {
  "content-type": "application/json",
  "x-api-key": API_KEY,
};

const createStubConversationsService = (
  overrides: Partial<ConversationsService> = {},
): ConversationsService => ({
  handoffConversation: async () => ({
    ...baseConversation,
    muted: true,
    mutedAt: 2_000,
    lastCustomerMessageAt: 2_000,
    nextAutoResumeAt: 2_000 + 12 * 60 * 60 * 1_000,
  }),
  resumeConversation: async () => baseConversation,
  ...overrides,
});

const createTestApp = (conversationsService: ConversationsService) =>
  createApp({
    conversationsService,
    runtimeConfig: {
      apiKey: API_KEY,
    },
  });

describe("conversation routes", () => {
  test("POST /api/companies/:companyId/conversations/handoff canonicalizes the phone number", async () => {
    let receivedPhoneNumber: string | undefined;
    const app = createTestApp(createStubConversationsService({
      handoffConversation: async (input) => {
        receivedPhoneNumber = input.phoneNumber;
        return {
          ...baseConversation,
          muted: true,
          mutedAt: 2_000,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/conversations/handoff", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        phoneNumber: " +967 700 000 001 ",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPhoneNumber).toBe("967700000001");
    expect(body.conversation.muted).toBe(true);
  });

  test("POST /api/companies/:companyId/conversations/resume returns 404 for missing conversations", async () => {
    const app = createTestApp(createStubConversationsService({
      resumeConversation: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/conversations/resume", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        phoneNumber: "967700000001",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Conversation not found",
      },
    });
  });

  test("POST conversation routes reject invalid bodies", async () => {
    const app = createTestApp(createStubConversationsService());

    const response = await app.request("/api/companies/company-1/conversations/handoff", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        phoneNumber: "   ",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "phoneNumber is required",
      },
    });
  });

  test("POST conversation routes map service failures", async () => {
    const app = createTestApp(createStubConversationsService({
      handoffConversation: async () => {
        throw new ConversationsServiceError(ERROR_CODES.DB_QUERY_FAILED, "Conversation state is temporarily unavailable", 503);
      },
    }));

    const response = await app.request("/api/companies/company-1/conversations/handoff", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        phoneNumber: "967700000001",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.DB_QUERY_FAILED,
        message: "Conversation state is temporarily unavailable",
      },
    });
  });
});
