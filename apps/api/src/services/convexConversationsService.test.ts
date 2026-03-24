import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createConvexConversationsService } from './convexConversationsService';

type StubConvexAdminClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createClientStub = (overrides: Partial<StubConvexAdminClient> = {}) => ({
  client: {
    query: async () => ({
      id: "conversation-1",
      companyId: "company-1",
      phoneNumber: "967700000001",
      muted: false,
    }),
    mutation: async () => ({
      id: "conversation-1",
      companyId: "company-1",
      phoneNumber: "967700000001",
      muted: true,
      mutedAt: 1_000,
    }),
    ...overrides,
  } satisfies StubConvexAdminClient,
});

describe("createConvexConversationsService", () => {
  test("returns null when a conversation cannot be found", async () => {
    const { client } = createClientStub({
      query: async () => null,
    });
    const service = createConvexConversationsService({
      createClient: () => client as never,
    });

    await expect(service.handoffConversation({
      companyId: "company-1",
      phoneNumber: "967700000001",
    })).resolves.toBeNull();
  });

  test("returns existing state for idempotent resume", async () => {
    const { client } = createClientStub({
      query: async () => ({
        id: "conversation-1",
        companyId: "company-1",
        phoneNumber: "967700000001",
        muted: false,
      }),
      mutation: async () => {
        throw new Error("should not be called");
      },
    });
    const service = createConvexConversationsService({
      createClient: () => client as never,
    });

    await expect(service.resumeConversation({
      companyId: "company-1",
      phoneNumber: "967700000001",
    })).resolves.toEqual({
      id: "conversation-1",
      companyId: "company-1",
      phoneNumber: "967700000001",
      muted: false,
    });
  });

  test("maps validator failures to a validation service error", async () => {
    const { client } = createClientStub({
      query: async () => {
        throw new Error("ArgumentValidationError: Unable to decode value");
      },
    });
    const service = createConvexConversationsService({
      createClient: () => client as never,
    });

    await expect(service.handoffConversation({
      companyId: "bad company",
      phoneNumber: "967700000001",
    })).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 400,
    });
  });
});
